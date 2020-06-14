load("@bazel_migration_utils//:index.bzl", "enhanced_npm_package")
load("module_name.bzl", "module_name")
load("//package-builder:package_json.bzl", "package_json")

def package(name = "package", srcs = [], package_layers = []):
    lib_name = native.package_name()
    package_json(
        name = name,
        layers = ["//:common.package.json"] + package_layers,
        data = [lib_name]
    )