load("format_label.bzl", "format_label")
load("@build_bazel_rules_nodejs//:index.bzl", "npm_package_bin")

def to_query_input(labels):
    dep_labels = []
    for label in labels:
        label = format_label(label)
        dep_labels.append("deps({label})".format(label = label))
    return " union ".join(dep_labels)

def registry_deps(name, data, root_package):
    dep_labels_name = name + "_labels"
    query_input = to_query_input(data)
    native.genquery(
        name = dep_labels_name,
        expression = "kind(node_module_library, {query_input})".format(query_input = query_input),
        scope = data
    )

    npm_package_bin(
        name = name,
        tool = "//package-builder:cli",
        data = [
            dep_labels_name,
            root_package
        ],
        outs = [
            name + ".json"
        ],
        args = [
            "--inputPath",
            "$(location {dep_labels_name})".format(dep_labels_name = dep_labels_name),
            "--outputPath",
            "$@",
            "--rootPackage",
            "$(location {root_package})".format(root_package = root_package)
        ]
    )

