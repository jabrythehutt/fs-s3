load("@bazel_migration_utils//:index.bzl", "enhanced_npm_package")

def package(name, lib_name, deps = [], npm_deps = [], srcs = [], package_layers = []):
    enhanced_npm_package(
        name = name,
        root_package_json = "//:package.json",
        srcs = srcs,
        version = "0.0.0-PLACEHOLDER",
        module_name = "@jabrythehutt/" + lib_name,
        npm_deps = npm_deps,
        package_layers = ["//:common.package.json"] + package_layers,
        deps = deps,
    )