load("module_name.bzl", "module_name")
load("//package-builder:package_json.bzl", "package_json")
load("@build_bazel_rules_nodejs//:index.bzl", "pkg_npm")

def package(name = "npm_package", srcs = [], package_layers = []):
    lib_name = native.package_name()
    package_json(
        name = "package",
        layers = ["//:common.package.json"] + package_layers,
        data = [lib_name]
    )
    pkg_npm(
        name = name,
        srcs = srcs,
        deps = [lib_name, "package"]
    )


