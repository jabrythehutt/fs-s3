load("@npm//@bazel/typescript:index.bzl", "ts_library")
load("@build_bazel_rules_nodejs//:index.bzl", "nodejs_binary")

def simple_cli(name, file, deps):
    lib_name = name + "_lib"
    ts_library(
        name  = lib_name,
        srcs = [file],
        deps = deps,
        devmode_target = "es5"
    )

    compiled_lib_name = name + "_compiled"
    native.filegroup(
        name = compiled_lib_name,
        srcs = [
            lib_name
        ],
        output_group = "es5_sources"
    )

    nodejs_binary(
        name = name,
        entry_point = compiled_lib_name,
        data = [
            compiled_lib_name
        ] + deps
    )