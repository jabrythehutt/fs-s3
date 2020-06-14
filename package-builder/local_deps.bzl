load("@build_bazel_rules_nodejs//:providers.bzl", "node_modules_aspect", "NpmPackageInfo", "LinkablePackageInfo", "JSNamedModuleInfo", "JSEcmaScriptModuleInfo", "DeclarationInfo")
load("@build_bazel_rules_nodejs//internal/linker:link_node_modules.bzl", "module_mappings_aspect")

def _impl(ctx):
    output = ctx.outputs.out
    dependencies = {}
    own_name = ""
    for d in ctx.attr.data:
        own_name = d[LinkablePackageInfo].package_name
        for k, v in getattr(d, "link_node_modules__aspect_result", {}).items():
            if k != own_name:
                dependencies[k] = ctx.attr.version
    package_json = struct(name = own_name, version = ctx.attr.version, dependencies = struct(**dependencies))
    ctx.actions.write(output, package_json.to_json(), is_executable=False)


local_deps = rule(
    implementation = _impl,
    attrs = {
        "version": attr.string(
            doc = "The version to print for the local packages",
            default = "0.0.0-PLACEHOLDER"
        ),
        "data": attr.label_list(
            doc = "NPM packages",
            mandatory = True,
            aspects = [module_mappings_aspect, node_modules_aspect]
        )
    },
    outputs = {"out": "%{name}.json"}
)