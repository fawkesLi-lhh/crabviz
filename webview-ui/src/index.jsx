/* @refresh reload */
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';

import './index.css';
import App from './App';

const root = document.getElementById('root');
const [props, setProps] = createSignal(document.crabvizProps);

window.addEventListener('message', (event) => {
  const msg = event.data;
  console.log('[Crabviz webview] recv', msg);
  if (msg?.command === 'render graph') {
    document.crabvizProps = {
      graph: msg.graph,
      root: msg.root,
      focus: msg.focus,
    };
    console.log('[Crabviz webview] render graph', {
      files: msg.graph?.files?.length,
      relations: msg.graph?.relations?.length,
    });
    setProps(document.crabvizProps);
  }
});

render(() => {
  const current = props();
  console.log('[Crabviz webview] render root', {
    hasProps: !!current,
    files: current?.graph?.files?.length,
    relations: current?.graph?.relations?.length,
  });
  return <App {...current} />;
}, root);
