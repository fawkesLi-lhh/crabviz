import * as vscode from 'vscode';

import { GlobalPosition } from './generator';
import { GraphGenerator } from '../out/crabviz';

export class CallGraphPanel {
	public static readonly viewType = 'crabviz.callgraph';

	public static currentPanel: CallGraphPanel | null = null;
	private static num = 1;

	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private readonly _output: vscode.OutputChannel;
	private readonly _debug = true;
	private _disposables: vscode.Disposable[] = [];
	private _graph: any | null = null;
	private _originalGraph: any | null = null;
	private _root: string = '';
	private _focus: GlobalPosition | null = null;
	private readonly _generator = new GraphGenerator("", false);

	public constructor(extensionUri: vscode.Uri) {
		this._extensionUri = extensionUri;
		this._output = vscode.window.createOutputChannel('Crabviz');

		const panel = vscode.window.createWebviewPanel(CallGraphPanel.viewType, `Crabviz #${CallGraphPanel.num}`, vscode.ViewColumn.One, {
			localResourceRoots: [
				vscode.Uri.joinPath(this._extensionUri, 'out'),
			],
			enableScripts: true
		});

		panel.iconPath = vscode.Uri.joinPath(this._extensionUri, 'assets', 'icon.svg');

		this._panel = panel;

		this._panel.webview.onDidReceiveMessage(
			msg => {
				this.log(`recv ${JSON.stringify(msg)}`);
				if (msg.source === 'webview-ui') {
					this.log('source=webview-ui');
				}
				switch (msg.command) {
					case "save SVG":
						this.save(msg.svg, "svg");
						break;
					case "save HTML":
						this.save(msg.html, "html");
						break;
					case "save CRBVIZ":
						this.save(msg.crbviz, "crbviz");
						break;
					case 'go to definition':
						vscode.workspace.openTextDocument(vscode.Uri.file(msg.path))
							.then(doc => vscode.window.showTextDocument(doc))
							.then(editor => {
								let position = new vscode.Position(msg.ln, msg.col);
								let range = new vscode.Range(position, position);
								editor.selection = new vscode.Selection(position, position);
								editor.revealRange(range);
							});
						break;
					case 'filter descendants':
						this.applyFilter('descendants', msg.path, msg.ln, msg.col);
						break;
					case 'filter ancestors':
						this.applyFilter('ancestors', msg.path, msg.ln, msg.col);
						break;
					case 'reset graph':
						this.resetGraph();
						break;
					case 'render graph':
						this.log('render graph requested');
						break;
					default:
						this.log(`unknown command ${msg.command}`);
						break;
				}
			},
			null,
			this._disposables
		);

		this._panel.onDidChangeViewState(
			() => {
				if (panel.active) {
					CallGraphPanel.currentPanel = this;
				} else if (CallGraphPanel.currentPanel !== this) {
					return;
				} else {
					CallGraphPanel.currentPanel = null;
				}
			},
			null,
			this._disposables
		);

		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		CallGraphPanel.num += 1;
	}

	public dispose() {
		if (CallGraphPanel.currentPanel === this) {
			CallGraphPanel.currentPanel = null;
		}

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

	public showCallGraph(graph: any, root: string, focus: GlobalPosition | null = null) {
		CallGraphPanel.currentPanel = this;
		this._graph = graph;
		this._originalGraph = graph;
		this._root = root;
		this._focus = focus;
		this._panel.webview.html = this.makeHtml(graph, root, focus);
	}

	private makeHtml(graph: any, root: string, focus: GlobalPosition | null) {
		const nonce = getNonce();
		const webview = this._panel.webview;
		const assetsUri = vscode.Uri.joinPath(this._extensionUri, 'out', 'webview-ui');
		const cssUri = vscode.Uri.joinPath(assetsUri, "index.css");
		const jsUri = vscode.Uri.joinPath(assetsUri, "index.js");

		return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="script-src 'nonce-${nonce}' 'wasm-unsafe-eval'; style-src ${webview.cspSource};">
				<script nonce="${nonce}">
					const vscode = acquireVsCodeApi();

					document.crabvizProps = {
						graph: ${JSON.stringify(graph)},
						root: ${JSON.stringify(root)},
						focus: ${JSON.stringify(focus)},
					};

					window.addEventListener(
						"message",
						(e) => {
							vscode.postMessage(e.data);
						}
					);
				</script>
				<link rel="stylesheet" href="${webview.asWebviewUri(cssUri)}" />
				<script nonce="${nonce}" type="module" src="${webview.asWebviewUri(jsUri)}"></script>
			</head>
			<body data-vscode-context='{ "preventDefaultContextMenuItems": true }'>
				<div id="root"></div>
			</body>
			</html>
		`;
	}

	private applyFilter(direction: 'descendants' | 'ancestors', path: string, ln: number, col: number) {
		this.log(`applyFilter direction=${direction} path=${path} ln=${ln} col=${col}`);
		if (!this._graph) {
			this.log('no graph loaded');
			return;
		}

		const fileId = this.findFileId(path);
		this.log(`resolved fileId=${fileId}`);
		const selected = [{ fileId, line: ln, character: col }];
		this.log(`selected payload=${JSON.stringify(selected)}`);
		this.log(`before wasm call graph files=${this._graph.files?.length ?? 0} relations=${this._graph.relations?.length ?? 0}`);
		const payload = JSON.stringify({ graph: this._graph, selected });
		this.log(`payload to wasm=${payload}`);
		let filtered;
		if (direction === 'descendants') {
			filtered = this._generator.filter_descendants(payload);
		} else {
			filtered = this._generator.filter_ancestors(payload);
		}
		if (!filtered) {
			this.log('wasm returned null/undefined');
			return;
		}
		if (typeof filtered === 'string') {
			this.log(`wasm returned string=${filtered}`);
			filtered = JSON.parse(filtered);
		}
		this.log(`after wasm call graph files=${filtered.files?.length ?? 0} relations=${filtered.relations?.length ?? 0}`);

		this._graph = filtered;
		this._focus = { path, line: ln, character: col };
		this.log(`filtered files=${filtered.files?.length ?? 0} relations=${filtered.relations?.length ?? 0}`);
		this._panel.webview.html = this.makeHtml(filtered, this._root, this._focus);
	}

	private resetGraph() {
		if (!this._originalGraph) {
			this.log('resetGraph: no original graph');
			return;
		}
		this._graph = this._originalGraph;
		this._focus = null;
		this.log(`resetGraph files=${this._graph.files?.length ?? 0} relations=${this._graph.relations?.length ?? 0}`);
		this._panel.webview.html = this.makeHtml(this._graph, this._root, this._focus);
	}

	private findFileId(path: string): number {
		const file = this._graph?.files?.find((f: any) => f.path === path);
		return file?.id ?? 0;
	}

	private log(message: string) {
		if (!this._debug) {
			return;
		}
		this._output.appendLine(`[Crabviz] ${message}`);
	}

  save(content: string, ext: string) {
    vscode.window
      .showSaveDialog({
        saveLabel: "Save",
				filters: {
					ext: [ext],
				}
      })
      .then(async (uri) => {
        if (!uri) {
          return;
        }

        vscode.workspace.fs
          .writeFile(uri, Buffer.from(content, "utf8"))
          .then(null, (reason: any) => {
            vscode.window.showErrorMessage(`Error on writing file: ${reason}`);
          });
      });
  }
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
