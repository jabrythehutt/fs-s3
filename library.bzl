load("@npm_bazel_typescript//:index.bzl", "ts_library")

def library(name, srcs, deps):
    ts_library(
        name = name,
        module_name = "@jabrythehutt/" + name,
        srcs = srcs,
        deps = deps
    )