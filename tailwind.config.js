module.exports = {
  content: ['./index.html', './admin.html', './login.html', './*.js'],
  theme: {
    extend: {
      colors: {
        paper: '#f7f4ee',
        ink: '#282923',
        wood: '#875d3b',
        clay: '#b78457',
        sage: '#687365'
      },
      fontFamily: {
        arabic: ['IBM Plex Sans Arabic', 'sans-serif'],
        latin: ['Manrope', 'sans-serif']
      }
    }
  },
  plugins: []
};
