load("@npm_bazel_typescript//:index.bzl", "ts_library")

def library(srcs = [], deps = []):
    name = native.package_name()
    ts_library(
        name = name,
        module_name = "@jabrythehutt/" + name,
        srcs = srcs,
        deps = deps,
        devmode_module = "commonjs",
        devmode_target = "es5"
    )