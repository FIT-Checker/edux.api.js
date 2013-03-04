(function($, undefined) {

if (typeof $ != 'function') {
	return console.error('fitChecker.js: jQuery is missing, please load it.');
}

// jQuery selector extension
$.expr[':'].contentIs = function(el, idx, meta) {
    return $(el).text() === meta[3];
};

var fitChecker = function () {
	/** Inner data */
	var inner = {
		baseUrl: 'https://edux.fit.cvut.cz',
		username: null,
		trackEnabled: true,
		courses: {}
	};

	/**
	 * Loads subjects from edux.
	 *
	 * @param function success Success AJAX callback
	 * @param function error Error AJAX callback
	 */
	this.getSubjectsFromEdux = function(success, error) {
		$.ajax({
			timeout: 10000,
			async: true,
			type: 'POST',
			url: fitChecker.inner.baseUrl + '/lib/exe/ajax.php?dashboard_current_lang=cs',
			data: {
				call: dashboard_widget_update,
				widget_real_id: w_actual_courses_fit,
				widget_max: 0,
				lazy: 1
			},
			success: function(response) {
				var name;
				var username = $.trim($("div.user", response).text()
					.replace(/.*\(([a-z0-9]*)\).*/, "$1"));

				var courses = $("a[href^=/courses/]", response);
				if (courses.length <= 0) {
					if (error) {
						error("No subjects found.");
					}
				} else {
					courses.each(function(index, el) {
						name = $(el).attr("href").replace(/.*\/(.*)$/, "$1");
						fitChecker.inner.courses.push(name);
					});
				}
				if (success) {
					success(fitChecker.inner.courses);
				}
			},
			error: function(xhr, status, exception) {
				if (error) {
					error(status);
				}
			}
		});
	};

	/**
	 * Processes AJAX request.
	 * 
	 * @param function success Success AJAX callback
	 * @param function error Error AJAX callback
	 */
	this.ajax = function(path, success, error) {
		$.ajax({
			async: true,
			type: 'GET',
			url: fitChecker.inner.baseUrl + path,
			timeout: 10000,
			'success': success,
			'error': error
		});
	};

	/**
	 * Tracks event with given name and value.
	 * 
	 * @param string name Event name
	 * @param mixed value Event value
	 */
	this.trackGAEvent = function(name, value) {
		if (fitChecker.inner.trackEnabled) {
			try {
				var pageTracker = _gat._getTracker("UA-325731-18");
				pageTracker._trackPageview();
				pageTracker._trackEvent(name, value);
			} catch(exception) {
				console.log(exception);
			}
		}
	};

	this.getSubjectContent = function(name, success, error) {
		var user = fitChecker.getUsername();
		if (user === '' && error) {
			error("You're not logged in.");
		} else {
			var url = '/courses/' + name + '/_export/xhtml/classification/student/' + user + '/start';

			fitChecker.ajax(url,
				function(response) {
					var content = '';

					var firstTable = $("div.overTable:eq(0)", response).html();

					if (firstTable !== null) {
						// Get rid of unneccassary content
						firstTable = firstTable.replace(
							/(.*)<thead>.*<\/thead>(.*)/, "$1$2");
						firstTable = firstTable.replace(
							/(.*)<tr><td>login<\/td>.*<\/tr>(.*)/, "$1$2");
					}
					var secondTable = $("div.overTable:eq(1)", response).html();

					if (secondTable !== null) {
						secondTable = secondTable.replace(
							/(.*)<thead>.*<\/thead>(.*)/, "$1$2");
						secondTable = secondTable.replace(
							/(.*)<tr><td>login<\/td>.*<\/tr>(.*)/, "$1$2");
					}
					content += firstTable;
					content += '<h2><span>Shrnutí</span></h2>' + secondTable;

					if (content !== '' && success) {
						success(content);
					} else if (error) {
						error('No data for subject found.');
					}
				},
				function(xhr, status, exception) {
					if (error) {
						error(status);
					}
				}
			);
		}
	};

	this.getUsername = function(forceRefresh, success, error) {
		if (forceRefresh === true) {
			fitChecker.ajax('',
				function(response) {
					var username = $("div.user", response).text()
						.replace(/.*\(([a-z0-9]*)\).*/, "$1");
					if (username == _savedUsername && success) {
						success(username);
					} else if(error) {
						error("Mismatching entered and logged username");
					}
				},
				function(xhr, status, exception) {
					if (error) {
						error(status);
					}
				}
			);
			return null;
		} else {
			return _username;
		}
	};

	this.hideMessage = function() {
		$("div#status").fadeOut();
	};

	this.showMessage = function(text, type, timeout) {
		$(document).scrollTop(0);
		$("div#status").html(text).show().removeClass().addClass(type);
		if (timeout) {
			setTimeout(hideMessage, timeout);
		}
	};

	this.getJSONformattedTable = function(html) {
		// Small workaround to make jQuery to parse html in string
		html = "<div>" + html + "</div>";

		var json = {0: {}, 1: {}};

		$("table:eq(0) tr", html).each(function (index) {
			json[0][$("td:eq(0)", this).text()] = $("td:eq(1)", this).text();
		});
		$("table:eq(1) tr", html).each(function (index) {
			json[1][$("td:eq(0)", this).text()] = $("td:eq(1)", this).text();
		});

		return json;
	};

	/**
	 * Checks whether subject has inclusion or final mark and sum of all points.
	 *
	 * @return {
	 *		status:			inclusion|succeed|failed
	 *		sumOfPoints:	int
	 *	}
	 */
	this.getSubjectImportantsFromEdux = function(html) {
		var status = null, mark, realMark, sumOfPoints = null;
		var i, ii, next, el;

		// Inclusion
		var inclusionStrings = ['zápočet', 'zapocet', 'Zápočet', 'klasifikovaný zápočet', 'nárok na zápočet'];
		var inclusionValues= ['ANO', 'Ano', 'Z', '√'];

		for (i = 0; i < inclusionStrings.length; i++) {
			if (status == 'inclusion') {
				break;
			}

			el = $("td:contentIs('" + inclusionStrings[i] + "')", html);
			next = el.next('td');

			for (ii = 0; ii < next.length; ii++) {
				if (next[ii].firstChild !== null) {
					if ($.inArray(next[ii].firstChild.nodeValue, inclusionValues) !== -1) {
						status = 'inclusion';
						break;
					}
				}
			}
		}

		// Mark
		var markStrings = ['klasifikovaný zápočet', 'vysledek', 'Známka', 'zápočet', 'Zápočet'];
		var greenValues = ['A', 'B', 'C', 'D', 'E'];

		for (i = 0; i < markStrings.length; i++) {
			el = $("td:contentIs('" + markStrings[i] + "')", html);
			if (el.length > 0) {
				mark = el.next('td');

				for (ii = 0; ii < mark.length; ii++) {
					if (mark[ii].firstChild !== null) {
						realMark = mark[ii].firstChild.nodeValue;
						if ($.inArray(realMark, greenValues) != -1) {
							status = 'succeed';
							break;
						} else if (realMark == 'F') {
							status = 'failed';
							break;
						}
					}
				}
			}
		}

		// Get sum of all points
		var sumStrings = ['celkem', 'Celkem', 'suma', 'cvičení celkem', 'hodnoceni',
			'celkový počet'];

		for (i = 0; i < sumStrings.length; i++) {
			el = $("td:contentIs('" + sumStrings[i] + "')", html);
			if (el.length > 0) {
				next = el.next('td');
				for (ii = 0; ii < next.length; ii++) {
					if (next[ii].firstChild !== null) {
						sumOfPoints = next[ii].firstChild.nodeValue;
					}
				}
			}
		}

		return {'status': status, 'sumOfPoints': sumOfPoints};
	};
};

$.fitChecker = new ($.extend(fitChecker, $.fitChecker ? $.fitChecker : {}));

})(window.jQuery);
