load("module_name.bzl", "module_name")
load("//package-builder:package_json.bzl", "package_json")

def package(name = "npm_package", srcs = [], package_layers = []):
    lib_name = native.package_name()
    package_json(
        layers = ["//:common.package.json"] + package_layers,
        data = [lib_name]
    )

