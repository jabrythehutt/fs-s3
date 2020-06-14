load("module_name.bzl", "module_name")
load("//package-builder:index.bzl", "package_json")
load("@build_bazel_rules_nodejs//:index.bzl", "pkg_npm")

def package(name = "package", srcs = [], package_layers = []):
    lib_name = native.package_name()
    package_json_name = name + "_json"
    package_json(
        name = package_json_name,
        layers = ["//:common.package.json"] + package_layers,
        data = [lib_name]
    )
    pkg_npm(
        name = name,
        srcs = srcs,
        deps = [lib_name, package_json_name]
    )


