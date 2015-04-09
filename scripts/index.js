(function() {

	database = new DatabaseModel();
	database.download = new DatabaseQuery().download;

	if (!String.prototype.endsWith) {
		String.prototype.endsWith = function(searchString, position) {
			var subjectString = this.toString();
			if (position === undefined || position > subjectString.length) {
				position = subjectString.length;
			}
			position -= searchString.length;
			var lastIndex = subjectString.indexOf(searchString, position);
			return lastIndex !== -1 && lastIndex === position;
		};
	}

	var private = {
		debug: window.debug || true,
		// An object that contains all of the information, outside the database and
		// the theme, on how to display the page
		configuration: null,
		// An interchangable theme that will generate the final HTML and provides
		// CSS and JavaScript to help the page
		theme: null,
		// The database object of the path to display
		page: null,
		// An EJS template from the theme to generate the HTML with.
		template: null,
		historyCaused: false,
		elements: {
			body: document.body,
			content: document.getElementById('main-content'),
			refrences: null
		}
	};
	window.private = private;

	function getIndexPath(path, language, verses) {
		var fullPath = [path].concat(verses).join('.');
		return 'index.html?' + fullPath + '?lang=' + language
	}

	function displayPage(info) {
		//TODO: Move traversal logic here to accomidate books in links not downloaded.
		if (!private.historyCaused && info.id) {
			if (info) {
				history.pushState(info, info.name, "index.html?" + info.path);
			}
		}
		var conf = private.configuration;
		var ele = private.elements;
		var d = info.details;
		var needsDownload = info.type == 'book' ? !d.downloadedVersion || d.downloadedVersion < d.catalogVersion : false;

		console.log(info);
		private.page = info;

		document.title = getI18nMessage('app_title') + ' - ' + info.name;
		ele.content.innerHTML = private.template.render({
			page: {
				configuration: conf,
				path: info,
				getI18nMessage: getI18nMessage,
				languages: private.languages,
				generator: new HtmlGenerator(conf, getI18nMessage),
				loading: (needsDownload || !'type' in info) ? getI18nMessage('downloading') : false
			}
		});
		attachLinks('a[data-path]', onLinkClicked);
		attachLinks('.content a[href]', onRefrenceClicked);
		attachLinks('.refrences-close', onRefrenceClosedClicked);
		attachLinks('.refrences a[href]', onFootnoteClicked);
		ele.refrences = document.querySelector('.refrences')

		//TODO: Check for verses and scroll to there instead,
		document.body.scrollTop = 0;

		// Begin downloading book if not up to day. The template can similarly check if this is needed
		if (needsDownload) {
			return database.download.downloadBook(info.id).then(function() {
				return database.node.get(info.id).then(displayPage);
			});
		}

		return info;
	}

	function attachLinks(query, handler) {
		var links = document.querySelectorAll(query);
		for (var i = 0; i < links.length; i++) {
			links[i].addEventListener('click', function(e) {
				e.preventDefault();
				handler(e);
				return false;
			});
		}
	}

	function onLinkClicked(e) {
		var id = parseInt(e.target.dataset.id);
		database.node.get(id).then(displayPage);
	}

	function onRefrenceClicked(e) {
		//TODO: There are many links in the scripture content that do not refer to a footnote, but to another scripture
		// directly. The two types of links should be sent to one common function and dispatched from there. The event
		// listeners should all be for that dispatching function.

		var body = document.body;
		var refrence = e.target.hash.substring(1);
		var priorRefrences = document.querySelectorAll('.refrences .selected');
		var refrenceDiv = document.getElementById(refrence);
		if (!body.className.match(/(?:^|\s)refrences-open(?!\S)/g)) {
			body.className += ' refrences-open';
		}
		refrenceDiv.className = 'selected';
		for (var i = 0; i < priorRefrences.length; i++) {
			priorRefrences[i].className = '';
		}
		private.elements.refrences.scrollTop = refrenceDiv.offsetTop;
	}

	function onFootnoteClicked(e) {
		getConfiguration(e.target.pathname).then(function(conf) {
			return database.node.getPath(conf.language, conf.path).then(displayPage);
		});
	}

	function onRefrenceClosedClicked(e) {
		var body = document.body;
		body.className = body.className.replace(/(?:^|\s)refrences-open(?!\S)/g, '');
	}

	function onLanguageSelected(e) {

	}

	function loadTheme(theme) {
		console.log("Theme: ", theme)
		private.theme = theme;
		private.template = new EJS({
			text: theme.template
		});
		less.render(theme.style, {
			globalVars: private.configuration.themeOptions
		}).then(function(output) {
			document.getElementById('custom-css').innerHTML = output.css;
		});
	}

	function getUrlParameter(name, search) {
		search = (typeof search == 'string') ? search : location.search;
		return decodeURIComponent((new RegExp('[?|&]' + name + '=' +
					'([^&;]+?)(&|#|;|$)').exec(location.search) || [, ""])[1]
				.replace(/\+/g, '%20')) ||
			null
	}

	window.addEventListener('popstate', function() {
		private.historyCaused = true;
		displayPage(history.state);
		private.historyCaused = false;
	});

	function getI18nMessage(name, params) {
		var message = chrome.i18n.getMessage(name, params);
		if (!message) {
			return name;
		}
		return message;
	}

	function getConfiguration(search) {
		search = (typeof search == 'string') ? search : location.search.substring(1);
		var param = getUrlParameter;
		return Promise.all([database.settings.getAll(),
				database.language.getAll()
			])
			.then(function(e) {
				var path, conf;

				if (!search) {
					path = ['/'];
				} else if (search.lastIndexOf('?') != -1) {
					path = search.substring(0, search.lastIndexOf('?')).split('.');
					search = search.substring(search.lastIndexOf('?'))
				} else {
					path = search.split('.');
					search = '';
				}

				conf = e[0];
				conf.path = path[0];
				conf.verses = path;
				conf.verses.shift(1);
				conf.language = parseInt(param('lang', search)) || conf.language;
				//if (conf.path.indexOf('/', conf.path.length - 1) !== -1) {
				//  conf.path = conf.path.substring(0, conf.path.length - 1);
				//}
				//conf.reference = param('ref') || null;
				//TODO: Parse the refrences

				private.configuration = conf;
				private.languages = e[1];
				return conf;
			});
	}

	function startPage() {
		return database.open()
			.then(getConfiguration)
			.then(function(conf) {
				return Promise.all([
					database.node.getPath(conf.language, conf.path),
					database.theme.get(conf.theme)
				]);
			}).then(function(e) {
				var lang = private.configuration.language;
				// TODO: Verify the theme loaded correctly, then default to "default"
				loadTheme(e[1]);

				var path = e[0];
				if (!path) {
					return database.node.getPath(lang, '/').then(function(catalogRoot) {
						if (!catalogRoot) {
							//The catalog has not been downloaded. Lets do it.
							//TODO: Display Loading screen
							displayPage({
								path: '/'
							});
							return database.download.downloadCatalog(lang).then(startPage);
						} else {
							//TODO: Navigate up the path and redirect
							function findValidPath(path) {
								var path = path.split('/');
								path.pop();
								path = path.join('/');
								return database.node.getPath(lang, path).then(function(node) {
									if (node) {
										location.search = '?' + path + "?lang=" + lang
									} else {
										return findValidPath(path);
									}
								});
							}
							findValidPath(private.configuration.path);
						}
					});
				} else {
					return displayPage(e[0]);
				}
			});
	}

	startPage();

	if (private.debug) {
		window.debug = private;
		window.database = database;
		window.log = function log(e) {
			console.log(e);
			return e;
		};
	}
})();
