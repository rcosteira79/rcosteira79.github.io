const gulp = require("gulp");

// gulp plugins and utils
var gutil = require("gulp-util");
var livereload = require("gulp-livereload");
var postcss = require("gulp-postcss");
var sourcemaps = require("gulp-sourcemaps");

// postcss plugins
var autoprefixer = require("autoprefixer");
var colorFunction = require("postcss-color-function");
var cssnano = require("cssnano");
var customProperties = require("postcss-custom-properties");
var easyimport = require("postcss-easy-import");

const swallowError = error => {
  gutil.log(error.toString());
  gutil.beep();
  this.emit("end");
};

const nodemonServerInit = () => {
  livereload.listen(1234);
};

function css(/* cb */) {
  var processors = [
    easyimport,
    customProperties,
    colorFunction(),
    autoprefixer({ browsers: ["last 2 versions"] }),
    cssnano()
  ];

  return gulp
    .src("assets/css/*.css")
    .on("error", swallowError)
    .pipe(sourcemaps.init())
    .pipe(postcss(processors))
    .pipe(sourcemaps.write("."))
    .pipe(gulp.dest("assets/built/"))
    .pipe(livereload());
}

const build = (/* cb */) => {
  nodemonServerInit();
};

exports.default = gulp.series(
  css,
  gulp.parallel(build, function(/* cb */) {
    gulp.watch("assets/css/*.css", gulp.series(css));
  })
);
