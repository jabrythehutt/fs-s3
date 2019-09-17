import {resolve as resolvePath} from "path";
import {CleanWebpackPlugin} from "clean-webpack-plugin";

const distDir = resolvePath(__dirname, "dist");
export default {

    mode: "production",
    entry: resolvePath(__dirname, "src", "fs-s3-standalone.ts"),

    output: {
        path: distDir,
        filename: "fs-s3-standalone.min.js",
        libraryTarget: "var",
        library: "fss3"
    },

    devtool: "source-map",

    resolve: {
        extensions: [".webpack.js", ".web.js", ".ts", ".js", ".json"]
    },

    externals: {
        // require("jquery") is external and available
        //  on the global var jQuery
        "aws-sdk": "AWS"
    },

    module: {
        rules: [
            {
                test: /\.ts$/,
                enforce: "pre",
                loader: "tslint-loader",
                options: {
                    failOnHint: true
                }
            },
            {
                test: /\.ts$/,
                use: "ts-loader"
            }
        ]
    },
    node: {
        fs: "empty"
    },

    plugins: [
        new (CleanWebpackPlugin as any)()
    ]
};
