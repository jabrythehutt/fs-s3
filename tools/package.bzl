load("@bazel_migration_utils//:index.bzl", "enhanced_npm_package")
load("module_name.bzl", "module_name")

def package(name = "package", deps = [], npm_deps = [], srcs = [], package_layers = []):
    lib_name = native.package_name()
    enhanced_npm_package(
        name = name,
        root_package_json = "//:package.json",
        srcs = srcs,
        version = "0.0.0-PLACEHOLDER",
        module_name = module_name(),
        npm_deps = npm_deps,
        package_layers = ["//:common.package.json"] + package_layers,
        deps = [lib_name] + deps,
    )