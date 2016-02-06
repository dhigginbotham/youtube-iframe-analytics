var gulp = require('gulp');
var browserify = require('gulp-browserify');
var uglify = require('gulp-uglify');
 
gulp.task('scripts', function() {
  return gulp.src('src/index.js')
  .pipe(browserify({
    insertGlobals : false,
    debug : false,
    standalone: 'videoAnalytics'
  }))
  .pipe(uglify())
  .pipe(gulp.dest('./build'));
});

gulp.task('default', ['scripts']);