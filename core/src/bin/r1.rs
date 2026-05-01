#[derive(serde::Deserialize,Debug)]
#[serde(rename_all = "camelCase")]
struct FilterPayload {
    graph: crabviz::types::graph::Graph,
    selected: Vec<crabviz::types::graph::GlobalPosition>,
}

fn main() {
    let file = std::fs::read_to_string("../aa.json").unwrap();
    let graph: FilterPayload = serde_json::from_str(&file).unwrap();
    println!("{:?}", graph);
}
