use {
    super::GraphGenerator,
    crate::types::{
        graph::GlobalPosition,
        lsp::{CallHierarchyIncomingCall, CallHierarchyOutgoingCall, DocumentSymbol, Location, Position},
    },
    std::cell::RefCell,
    wasm_bindgen::prelude::*,
};

#[wasm_bindgen]
pub fn set_panic_hook() {
    // When the `console_error_panic_hook` feature is enabled, we can call the
    // `set_panic_hook` function at least once during initialization, and then
    // we will get better error messages if our code ever panics.
    //
    // For more details see
    // https://github.com/rustwasm/console_error_panic_hook#readme
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
extern "C" {
    // Use `js_namespace` here to bind `console.log(..)` instead of just
    // `log(..)`
    #[wasm_bindgen(js_namespace = console)]
    pub(crate) fn log(s: String);
}

#[wasm_bindgen(js_name = GraphGenerator)]
pub struct GraphGeneratorWasm {
    inner: RefCell<GraphGenerator>,
}

#[wasm_bindgen(js_class = GraphGenerator)]
impl GraphGeneratorWasm {
    #[wasm_bindgen(constructor)]
    pub fn new(lang: String, filter: bool) -> Self {
        Self {
            inner: RefCell::new(GraphGenerator::new(&lang, filter)),
        }
    }

    pub fn should_filter_out_file(&self, path: String) -> bool {
        self.inner.borrow().should_filter_out_file(&path)
    }

    pub fn add_file(&self, path: String, symbols: JsValue) -> bool {
        let symbols = serde_wasm_bindgen::from_value::<Vec<DocumentSymbol>>(symbols).unwrap();

        self.inner.borrow_mut().add_file(path, symbols)
    }

    pub fn add_incoming_calls(&self, path: String, position: JsValue, calls: JsValue) {
        let position = serde_wasm_bindgen::from_value::<Position>(position).unwrap();
        let calls =
            serde_wasm_bindgen::from_value::<Vec<CallHierarchyIncomingCall>>(calls).unwrap();

        self.inner
            .borrow_mut()
            .add_incoming_calls(path, position, calls);
    }

    pub fn add_outgoing_calls(&self, path: String, position: JsValue, calls: JsValue) {
        let position = serde_wasm_bindgen::from_value::<Position>(position).unwrap();
        let calls =
            serde_wasm_bindgen::from_value::<Vec<CallHierarchyOutgoingCall>>(calls).unwrap();

        self.inner
            .borrow_mut()
            .add_outgoing_calls(path, position, calls);
    }

    pub fn add_interface_implementations(
        &self,
        path: String,
        position: JsValue,
        locations: JsValue,
    ) {
        let position = serde_wasm_bindgen::from_value::<Position>(position).unwrap();
        let locations = serde_wasm_bindgen::from_value::<Vec<Location>>(locations).unwrap();

        self.inner
            .borrow_mut()
            .add_interface_implementations(path, position, locations);
    }

    pub fn gen_graph(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.inner.borrow().gen_graph()).unwrap()
    }

    pub fn filter_descendants(&self, payload: JsValue) -> JsValue {
        log(format!(
            "filter_descendants raw={}",
            payload.as_string().unwrap_or_else(|| "<non-string payload>".to_string())
        ));
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct FilterPayload {
            graph: crate::types::graph::Graph,
            selected: Vec<GlobalPosition>,
        }

        let payload = match payload.as_string() {
            Some(value) => match serde_json::from_str::<FilterPayload>(&value) {
                Ok(payload) => payload,
                Err(err) => {
                    log(format!("filter_descendants deserialize error: {err} {value}"));
                    return JsValue::from_str(&format!("deserialize error FilterPayload: {err} {value}"));
                }
            },
            None => {
                log("filter_descendants deserialize error: payload is not string".to_string());
                return JsValue::from_str("deserialize error: payload is not string");
            }
        };

        log(format!(
            "filter_descendants rust in files={} relations={} selected={:?}",
            payload.graph.files.len(),
            payload.graph.relations.len(),
            payload.selected
        ));
        let filtered = payload.graph.filter_descendants(&payload.selected);
        log(format!(
            "filter_descendants rust out files={} relations={}",
            filtered.files.len(),
            filtered.relations.len()
        ));
        match serde_json::to_string(&filtered) {
            Ok(value) => JsValue::from_str(&value),
            Err(err) => {
                log(format!("filter_descendants serialize error: {err}"));
                JsValue::NULL
            }
        }
    }

    pub fn filter_ancestors(&self, payload: JsValue) -> JsValue {
        log(format!(
            "filter_ancestors raw={}",
            payload.as_string().unwrap_or_else(|| "<non-string payload>".to_string())
        ));
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct FilterPayload {
            graph: crate::types::graph::Graph,
            selected: Vec<GlobalPosition>,
        }

        let payload = match payload.as_string() {
            Some(value) => match serde_json::from_str::<FilterPayload>(&value) {
                Ok(payload) => payload,
                Err(err) => {
                    log(format!("filter_ancestors deserialize error: {err} {value}"));
                    return JsValue::from_str(&format!("deserialize error FilterPayload: {err} {value}"));
                }
            },
            None => {
                log("filter_ancestors deserialize error: payload is not string".to_string());
                return JsValue::from_str("deserialize error: payload is not string");
            }
        };

        log(format!(
            "filter_ancestors rust in files={} relations={} selected={:?}",
            payload.graph.files.len(),
            payload.graph.relations.len(),
            payload.selected
        ));
        let filtered = payload.graph.filter_ancestors(&payload.selected);
        log(format!(
            "filter_ancestors rust out files={} relations={}",
            filtered.files.len(),
            filtered.relations.len()
        ));
        match serde_json::to_string(&filtered) {
            Ok(value) => JsValue::from_str(&value),
            Err(err) => {
                log(format!("filter_ancestors serialize error: {err}"));
                JsValue::NULL
            }
        }
    }
}
