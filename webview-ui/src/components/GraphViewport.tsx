import {
  createEffect,
  createResource,
  on,
  onMount,
  Component,
  Suspense,
} from "solid-js";

import { useAppContext, ScaleOption, ExportOption } from "../context";
import { Graph } from "../graph/types";
import { convert } from "../graph/graphviz";
import { renderSVG } from "../graph/render";
import { CallGraph } from "../graph/CallGraph";
import { html, svg } from "../export/templates";

import Spinner from "./Spinner";

import "./GraphViewport.css";

const GraphViewport: Component<{
  graph: Graph;
  root: string;
  focus: string | null;
}> = (props) => {
  const [
    { collapse, selectedElem, scaleOpt, exportOpt },
    { setItems, setSelectedElem, setScaleOpt },
  ] = useAppContext();

  const cache = new Map<string, CallGraph>();

  const [callGraph] = createResource(
    () => {
      const key = `${collapse() ? 1 : 2}:${props.graph.files.length}:${props.graph.relations.length}:${props.root}:${props.focus ?? ''}`;
      console.log('[Crabviz viewport] resource key', key, {
        files: props.graph.files.length,
        relations: props.graph.relations.length,
        focus: props.focus,
      });
      return key;
    },
    async (key) => {
      console.log('[Crabviz viewport] loading graph', key, {
        files: props.graph.files.length,
        relations: props.graph.relations.length,
      });
      if (!cache.has(key)) {
        const isCollapsed = key.startsWith('1:');
        const svg = await renderSVG(
          convert(props.graph, props.root, isCollapsed),
          props.focus
        );

        console.log('[Crabviz viewport] rendered svg', {
          width: svg.getAttribute('width'),
          height: svg.getAttribute('height'),
        });
        cache.set(key, new CallGraph(svg, props.focus, setSelectedElem));
      }

      return cache.get(key)!;
    }
  );

  onMount(() => {
    createEffect(
      on(callGraph, (callGraph, prevCallGraph) => {
        if (!callGraph) {
          return;
        }

        // manually reset styles for the previous graph
        // if I just call `setSelectedElem(null)`, it would reset styles for the current graph because of the auto-batch feature
        prevCallGraph?.resetStyles();

        callGraph.setUpPanZoom();

        setSelectedElem(null);
        setScaleOpt(ScaleOption.Reset);
        setItems({
          files: new Map(Array.from(callGraph.nodes, (e) => [e.id, e])),
          symbols: Array.from(
            callGraph.svg.querySelectorAll<SVGElement>(".cell").values()
          ),
        });
      })
    );

    createEffect(
      on(
        scaleOpt,
        (opt) => {
          switch (opt) {
            case ScaleOption.ZoomIn:
              callGraph()?.smoothZoom(2);
              break;
            case ScaleOption.ZoomOut:
              callGraph()?.smoothZoom(0.5);
              break;
            case ScaleOption.Reset:
              callGraph()?.resetPanZoom();
              break;
          }
        },
        { defer: true }
      )
    );

    createEffect(
      on(
        selectedElem,
        (elem) => {
          callGraph()?.onSelectElem(elem);
        },
        { defer: true }
      )
    );

    createEffect(
      on(
        exportOpt,
        (opt) => {
          const graph = callGraph()!;
          const width = graph.width,
            height = graph.height;
          const svgContent = graph.svg.innerHTML.replaceAll("&nbsp;", "&#160;");

          switch (opt) {
            case ExportOption.Svg:
              window.postMessage({
                command: "save SVG",
                svg: svg(
                  svgContent.replace(
                    /transform="matrix\(.*?\)"/,
                    `transform="translate(0 ${height})"`
                  ),
                  width,
                  height
                ),
              });
              break;
            case ExportOption.Html:
              window.postMessage({
                command: "save HTML",
                html: html(svgContent, width, height, props.focus),
              });
              break;
          }
        },
        { defer: true }
      )
    );
  });

  return (
    <Suspense fallback={<Spinner />}>
      <div class="viewport">{callGraph()?.svg}</div>
    </Suspense>
  );
};

export default GraphViewport;
