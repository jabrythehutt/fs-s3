load("@bazel_migration_utils//:index.bzl", "enhanced_npm_package")
load("module_name.bzl", "module_name")
load("//package-builder:local_deps.bzl", "local_deps")
load("//package-builder:registry_deps.bzl", "registry_deps")

def package(name = "package", srcs = [], package_layers = []):
    lib_name = native.package_name()
    version = "0.0.0-PLACEHOLDER"
    local_deps(
        name = "local_deps",
        data = [lib_name],
        version = version
    )

    registry_deps(
        name = "registry_deps",
        data = [lib_name]
    )


    enhanced_npm_package(
        name = name,
        root_package_json = "//:package.json",
        srcs = srcs,
        version = version,
        module_name = module_name(),
        package_layers = ["//:common.package.json", "local_deps"] + package_layers,
        deps = [lib_name],
    )