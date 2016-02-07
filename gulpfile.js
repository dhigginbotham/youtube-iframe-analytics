var gulp = require('gulp');
var browserify = require('gulp-browserify');
var uglify = require('gulp-uglify');
var ghpages = require('gulp-gh-pages');
var rename = require('gulp-rename');
 
gulp.task('scripts', function() {
  return gulp.src('src/index.js')
  .pipe(browserify({
    insertGlobals : false,
    debug : false,
    standalone: 'videoAnalytics'
  }))
  .pipe(uglify())
  .pipe(rename('./videoAnalytics.min.js'))
  .pipe(gulp.dest('./examples/js'))
  .pipe(gulp.dest('./build'));
});

gulp.task('ghpages', function() {
  return gulp.src('examples/**/*')
  .pipe(ghpages());
});

gulp.task('watch', function() {
  gulp.watch(['./src/**/*','./examples/**/*'], ['scripts']);
});

gulp.task('default', ['scripts', 'watch']);