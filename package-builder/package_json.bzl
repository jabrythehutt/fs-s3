load("local_deps.bzl", "local_deps")
load("registry_deps.bzl", "registry_deps")
load("@build_bazel_rules_nodejs//:index.bzl", "npm_package_bin")

def to_layer_paths(layers):
    paths = []
    for layer in layers:
        paths.append("$(locations {layer})".format(layer = layer))
    return paths

def package_json(name, output_path = "package.json", root_package = "//:package.json", data = [], layers = [], version = "0.0.0-PLACEHOLDER"):

    local_deps_name = name + "_local_deps"
    local_deps(
        name = local_deps_name,
        data = data,
        version = version
    )

    registry_deps_name = name + "_registry_deps"
    registry_deps(
        name = registry_deps_name,
        data = data,
        root_package = root_package
    )

    npm_package_bin(
        name = name,
        data = [
            local_deps_name,
            registry_deps_name
        ] + layers,
        outs = [
            output_path
        ],
        tool = "//package-builder:merge_json",
        args = [
            "--outputPath",
            "$@",
            "--layers"
        ] + to_layer_paths(layers + [registry_deps_name, local_deps_name])
    )