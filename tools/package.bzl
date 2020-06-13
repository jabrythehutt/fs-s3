load("@bazel_migration_utils//:index.bzl", "enhanced_npm_package")
load("module_name.bzl", "module_name")

def package(name = "package", deps = [], npm_deps = [], srcs = [], package_layers = []):
    lib_name = native.package_name()
    local_deps = name + "_local_deps"
    native.genquery(
        name = local_deps,
        expression = "kind(pkg_npm, same_pkg_direct_rdeps(kind(ts_library, deps({lib_name})) except {lib_name}))".format(lib_name = lib_name),
        scope = [
            lib_name
        ]
    )



    enhanced_npm_package(
        name = name,
        root_package_json = "//:package.json",
        srcs = srcs,
        version = "0.0.0-PLACEHOLDER",
        module_name = module_name(),
        npm_deps = [local_deps],
        package_layers = ["//:common.package.json"] + package_layers,
        deps = [lib_name] + deps,
    )