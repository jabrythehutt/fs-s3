/**
 * Created by djabry on 04/06/2016.
 */
/**
 * Created by djabry on 10/05/2016.
 */
'use strict';

const webpack = require('webpack');
const UglifyJsPlugin = require('webpack/lib/optimize/UglifyJsPlugin');
const CompressionPlugin = require('compression-webpack-plugin');
const DedupePlugin = require('webpack/lib/optimize/DedupePlugin');

process.env.AWS_SERVICES = 's3'; // optional

module.exports = {

    entry: './fs-s3-standalone.ts',

    output: {
        path: __dirname + '/dist',
        filename: 'fs-s3-standalone.min.js',
        libraryTarget: "var",
        library: "fss3"
    },

    devtool: 'source-map',

    resolve: {
        extensions: ['', '.webpack.js', '.web.js', '.ts', '.js', '.json']
    },

    module: {
        // noParse: [/cssnano/],
        preloaders: [
            {
                test: /\.ts$/,
                loader: 'tslint'
            }
        ],
        loaders: [
            {
                test: /aws-sdk/,
                loaders: [
                    'transform?aws-sdk/dist-tools/transform'
                ]
            },
            {
                test: /\.json$/, loaders: ['json']
            },
            {
                test: /\.html$/,
                loader: 'raw'
            },
            {
                test: /\.ts$/,
                loader: 'ts'
            },
            {
                test: /\.scss$/,
                loader: 'style!css!postcss!sass'
            },
            {
                test: /bootstrap-sass\/assets\/javascripts\//,
                loader: 'imports?jQuery=jquery'
            },
            {
                test: /\.(woff2?|svg)$/,
                loader: 'url?limit=10000'
            },
            {
                test: /\.(ttf|eot)$/,
                loader: 'file'
            }
        ]
    },
    node: {
        fs: "empty"
    },

    plugins: [
        new webpack.optimize.OccurenceOrderPlugin(true),
        new DedupePlugin(),
        new UglifyJsPlugin({
            // beautify: true, //debug
            // mangle: false, //debug
            // dead_code: false, //debug
            // unused: false, //debug
            // deadCode: false, //debug
            // compress: {
            //   screw_ie8: true,
            //   keep_fnames: true,
            //   drop_debugger: false,
            //   dead_code: false,
            //   unused: false
            // }, // debug
            // comments: true, //debug

            beautify: false, //prod

            mangle: {
                screw_ie8: true,
                keep_fnames: true
            }, //prod

            compress: {
                screw_ie8: true
            }, //prod

            comments: false //prod
        }),
        new CompressionPlugin({
            regExp: /\.css$|\.html$|\.js$|\.map$/,
            threshold: 2 * 1024
        })
    ]
};