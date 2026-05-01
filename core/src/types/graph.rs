use {
    super::lsp::{Position, Range, SymbolKind},
    serde::{Deserialize, Serialize},
    serde_repr::{Serialize_repr,Deserialize_repr},
    std::hash::{Hash, Hasher},
};

#[derive(Debug, Serialize, Deserialize)]
pub struct Graph {
    pub files: Vec<File>,
    pub relations: Vec<Relation>,
}

impl Graph {
    pub fn filter_descendants(&self, selected: &[GlobalPosition]) -> Self {
        self.filter_by_traversal(selected, TraversalDirection::Descendants)
    }

    pub fn filter_ancestors(&self, selected: &[GlobalPosition]) -> Self {
        self.filter_by_traversal(selected, TraversalDirection::Ancestors)
    }

    fn filter_by_traversal(&self, selected: &[GlobalPosition], direction: TraversalDirection) -> Self {
        use std::collections::{HashMap, HashSet};

        let selected: HashSet<_> = selected.iter().copied().collect();
        if selected.is_empty() {
            return Self {
                files: Vec::new(),
                relations: Vec::new(),
            };
        }

        let mut adjacency: HashMap<GlobalPosition, Vec<GlobalPosition>> = HashMap::new();
        for relation in &self.relations {
            match direction {
                TraversalDirection::Descendants => {
                    adjacency.entry(relation.from).or_default().push(relation.to);
                }
                TraversalDirection::Ancestors => {
                    adjacency.entry(relation.to).or_default().push(relation.from);
                }
            }
        }

        let mut keep = selected.clone();
        let mut stack: Vec<_> = selected.iter().copied().collect();

        while let Some(current) = stack.pop() {
            if let Some(next_nodes) = adjacency.get(&current) {
                for next in next_nodes {
                    if keep.insert(*next) {
                        stack.push(*next);
                    }
                }
            }
        }

        let files = self
            .files
            .iter()
            .filter_map(|file| file.filter_by_positions(&keep))
            .collect();

        let relations = self
            .relations
            .iter()
            .filter(|relation| keep.contains(&relation.from) && keep.contains(&relation.to))
            .cloned()
            .collect();

        Self { files, relations }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct File {
    pub id: u32,
    pub path: String,
    pub symbols: Vec<Symbol>,
}

impl File {
    fn filter_by_positions(&self, keep: &std::collections::HashSet<GlobalPosition>) -> Option<Self> {
        let symbols = self
            .symbols
            .iter()
            .filter_map(|symbol| symbol.filter_by_positions(self.id, keep))
            .collect::<Vec<_>>();

        if symbols.is_empty() {
            return None;
        }

        Some(Self {
            id: self.id,
            path: self.path.clone(),
            symbols,
        })
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Symbol {
    pub name: String,
    pub kind: SymbolKind,
    pub range: Range,
    pub children: Vec<Symbol>,
}

impl Symbol {
    fn filter_by_positions(
        &self,
        file_id: u32,
        keep: &std::collections::HashSet<GlobalPosition>,
    ) -> Option<Self> {
        let current = GlobalPosition::new(file_id, self.range.start);
        if !keep.contains(&current) {
            return None;
        }

        let children = self
            .children
            .iter()
            .filter_map(|child| child.filter_by_positions(file_id, keep))
            .collect();

        Some(Self {
            name: self.name.clone(),
            kind: self.kind,
            range: self.range,
            children,
        })
    }
}

#[derive(Debug, Clone, Copy)]
enum TraversalDirection {
    Descendants,
    Ancestors,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Relation {
    pub from: GlobalPosition,
    pub to: GlobalPosition,
    pub kind: RelationKind,
}

impl Hash for Relation {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.from.hash(state);
        self.to.hash(state);
    }
}

impl PartialEq for Relation {
    fn eq(&self, other: &Self) -> bool {
        self.from == other.from && self.to == other.to
    }
}

impl Eq for Relation {}

#[derive(Debug, Clone, Serialize_repr, Deserialize_repr)]
#[repr(u8)]
pub enum RelationKind {
    Call,
    Impl,
    Inherit,
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalPosition {
    pub file_id: u32,
    pub line: u32,
    pub character: u32,
}

impl GlobalPosition {
    pub fn new(file_id: u32, position: Position) -> Self {
        Self {
            file_id,
            line: position.line,
            character: position.character,
        }
    }
}
