load("@bazel_migration_utils//:index.bzl", "enhanced_npm_package")
load("module_name.bzl", "module_name")
load("local_package.bzl", "local_package")

def package(name = "package", srcs = [], package_layers = []):
    lib_name = native.package_name()
    local_deps = name + "_local_deps.txt"
    bazel_lib_name = "//" + lib_name + ":" + lib_name

    version = "0.0.0-PLACEHOLDER"

    local_package(
        name = "local_deps",
        data = [lib_name],
        version = version
    )

    enhanced_npm_package(
        name = name,
        root_package_json = "//:package.json",
        srcs = srcs,
        version = version,
        module_name = module_name(),
        npm_deps = [],
        package_layers = ["//:common.package.json", "local_deps"] + package_layers,
        deps = [lib_name] + deps,
    )