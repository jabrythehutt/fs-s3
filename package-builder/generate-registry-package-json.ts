import yargs from "yargs";
import {readFileSync, writeFileSync} from "fs";

const args = yargs.option("inputPath", {requiresArg: true, string: true})
    .option("rootPackage", {requiresArg: true, string: true})
    .option("registryPrefix", {string: true, default: "@npm"})
    .option("outputPath", {requiresArg: true, string: true}).argv;

const rootPackageJsonString = readFileSync(args.rootPackage).toString();
const rootPackageJson = JSON.parse(rootPackageJsonString);
const rootDeps = rootPackageJson.dependencies || {};

const libDepNames = readFileSync(args.inputPath).toString()
    .split("\n")
    .map(l => l.split(":").shift())
    .map(l => l.replace(`${args.registryPrefix}//`, ""))
    .filter((l, index, arr) => arr.indexOf(l) === index);

const libDeps = Object.keys(rootDeps)
    .filter(name => libDepNames.includes(name))
    .reduce((deps, name) => ({
        ...deps,
        [name]: rootDeps[name]
    }), {});

const libPackageJson = {
    dependencies: libDeps
}

writeFileSync(args.outputPath, JSON.stringify(libPackageJson));