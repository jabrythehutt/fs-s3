
def format_label(original_label):
    label = original_label
    if not ":" in original_label:
        label = "{label}:{label}".format(label = label)
    if not original_label.startswith("//"):
        label = "//" + label
    return label


def to_query_input(labels):
    dep_labels = []
    for label in labels:
        label = format_label(label)
        dep_labels.append("deps({label})".format(label = label))
    return " union ".join(dep_labels)

def registry_deps(name, data):
    dep_labels_name = name + "_labels"
    query_input = to_query_input(data)
    native.genquery(
        name = dep_labels_name,
        expression = "kind(node_module_library, {query_input})".format(query_input = query_input),
        scope = data
    )