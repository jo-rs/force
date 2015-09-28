_ = require 'underscore'
Articles = require '../../collections/articles'
PAGE_SIZE = 100

@news = (req, res, next) ->
  new Articles().fetch
    cache: true
    data:
      # id for "Artsy Editorial" (exclude partner posts)
      author_id: "503f86e462d56000020002cc"
      published: true
      sort: '-published_at'
      exclude_google_news: false
      limit: PAGE_SIZE
    error: res.backboneError
    success: (articles) ->
      res.set('Content-Type', 'text/xml')
      publishedArticles = articles.filter (article) ->
        article.has('published_at')
      res.render('news', { articles: publishedArticles })
