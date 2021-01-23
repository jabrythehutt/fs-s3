import yargs from "yargs";
import {readFileSync, writeFileSync} from "fs";
import {merge} from "lodash";

const args = yargs.option("layers", {requiresArg: true, string: true, array: true})
    .option("outputPath", {requiresArg: true, string: true}).argv;


const merged = args.layers.map(f => readFileSync(f).toString())
    .map(s => JSON.parse(s) as object)
    .reduce((l1, l2) => merge(l1, l2), {});

writeFileSync(args.outputPath, JSON.stringify(merged, null, 4));
