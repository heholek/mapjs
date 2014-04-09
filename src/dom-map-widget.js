/*global MAPJS, $, _, Hammer*/
/*jslint nomen: true, newcap: true, browser: true*/
MAPJS.DOMRender = {
	config: {
		padding: 8,
		textMaxWidth: 160,
		textClass: 'mapjs-text'
	},
	dimensionProvider: function (idea) {
		'use strict';
		/* add line breaks to make consistent with PDF, or solve breaking in PDF differently */
		var textBox = $('<span>').addClass(MAPJS.DOMRender.config.textClass).text(idea.title).css('max-width', MAPJS.DOMRender.config.textMaxWidth).addClass('invisible').appendTo('body'),
			result = {
			width: textBox.outerWidth() + 2 * MAPJS.DOMRender.config.padding,
			height: textBox.outerHeight() + 2 * MAPJS.DOMRender.config.padding
		}, icon = idea.attr && idea.attr.icon;
		if (icon) {
			if (icon.position === 'top' || icon.position === 'bottom') {
				result.width = Math.max(result.width, icon.width + 2 * MAPJS.DOMRender.config.padding);
				result.height = result.height + icon.height + MAPJS.DOMRender.config.padding;
			} else if (icon.position === 'left' || icon.position === 'right') {
				result.width = result.width + icon.width + MAPJS.DOMRender.config.padding;
				result.height = Math.max(result.height, icon.height + 2 * MAPJS.DOMRender.config.padding);
			} else {
				result.width = Math.max(result.width, icon.width + 2 * MAPJS.DOMRender.config.padding);
				result.height = Math.max(result.height, icon.height + 2 * MAPJS.DOMRender.config.padding);
			}
		}
		textBox.detach();
		return result;
	},
	layoutCalculator: function (contentAggregate) {
		'use strict';
		return MAPJS.calculateLayout(contentAggregate, MAPJS.DOMRender.dimensionProvider);
	}
};

$.fn.draggableContainer = function () {
	'use strict';
	var currentDragObject,
		originalDragObjectPosition,

		drag = function (event) {
			if (currentDragObject && event.gesture) {
				var newpos = {
						top: parseInt(originalDragObjectPosition.top, 10) + event.gesture.deltaY,
						left: parseInt(originalDragObjectPosition.left, 10) + event.gesture.deltaX
					};
				currentDragObject.css(newpos).trigger('mm:drag');
				event.preventDefault();
				if (event.gesture) {
					event.gesture.preventDefault();
				}
			}
		},
		rollback = function () {
			var target = currentDragObject; // allow it to be cleared while animating
			target.animate(originalDragObjectPosition, {
				complete: function () {
					target.trigger('mm:cancel-dragging');
				},
				progress: function () {
					target.trigger('mm:drag');
				}
			});
		};
	return Hammer($(this), {'drag_min_distance': 2}).on('mm:start-dragging', function (event) {
		if (!currentDragObject) {
			currentDragObject = $(event.relatedTarget);
			originalDragObjectPosition = {
				top: currentDragObject.css('top'),
				left: currentDragObject.css('left')
			};
			$(this).on('drag', drag);
		}
	}).on('dragend', function () {
		var evt = $.Event('mm:stop-dragging');
		if (currentDragObject) {
			currentDragObject.trigger(evt);
			$(this).off('drag', drag);
			if (evt.result === false) {
				rollback();
			}
			currentDragObject = undefined;
		}
	}).on('mouseleave', function () {
		if (currentDragObject) {
			$(this).off('drag', drag);
			rollback();
			currentDragObject = undefined;
		}
	}).attr('data-drag-role', 'container');
};
$.fn.draggable = function () {
	'use strict';
	return $(this).on('dragstart', function () {
		$(this).trigger(
			$.Event('mm:start-dragging', {
				relatedTarget: this
			})
		);
	});
};
$.fn.positionNode = function (stageElement) {
	'use strict';
	return $(this).each(function () {
		var node = $(this),
			xpos = node.data('x') + stageElement.data('stage-x'),
			ypos = node.data('y') + stageElement.data('stage-y'),
			growx = 0, growy = 0, minGrow = 100,
		    move = function () {
				var element = $(this),
					oldpos = {
						top: parseInt(element.css('top'), 10),
						left: parseInt(element.css('left'), 10)
					},
					newpos = {
						top: oldpos.top + growy,
						left: oldpos.left + growx
					};
				element.css(newpos);
			};
		if (xpos < 0) {
			growx = Math.max(-1 * xpos, minGrow);
		}
		if (ypos < 0) {
			growy = Math.max(-1 * ypos, minGrow);
		}
		if (growx > 0 || growy > 0) {
			stageElement.children().each(move);
			stageElement.data('stage-x', stageElement.data('stage-x') + growx);
			stageElement.data('stage-y', stageElement.data('stage-y') + growy);
		}
		node.css({
			'left': xpos + growx,
			'top': ypos + growy
		});
	});
};
MAPJS.domMediator = function (mapModel, stageElement) {
	'use strict';

	var connectorKey = function (connectorObj) {
			return 'connector_' + connectorObj.from + '_' + connectorObj.to;
		},
		svg = function (tag) {
			return document.createElementNS('http://www.w3.org/2000/svg', tag);
		},
		horizontalConnector = function (parentX, parentY, parentWidth, parentHeight,
				childX, childY, childWidth, childHeight) {
			var childHorizontalOffset = parentX < childX ? 0.1 : 0.9,
				parentHorizontalOffset = 1 - childHorizontalOffset;
			return {
				from: {
					x: parentX + parentHorizontalOffset * parentWidth,
					y: parentY + 0.5 * parentHeight
				},
				to: {
					x: childX + childHorizontalOffset * childWidth,
					y: childY + 0.5 * childHeight
				},
				controlPointOffset: 0
			};
		},
		calculateConnector = function (parent, child) {
			return calculateConnectorInner(parent.position().left, parent.position().top, parent.outerWidth(true), parent.outerHeight(true),
				child.position().left, child.position().top, child.outerWidth(true), child.outerHeight(true));
		},
		calculateConnectorInner = _.memoize(function (parentX, parentY, parentWidth, parentHeight,
				childX, childY, childWidth, childHeight) {
			var tolerance = 10,
				childMid = childY + childHeight * 0.5,
				parentMid = parentY + parentHeight * 0.5,
				childHorizontalOffset;
			if (Math.abs(parentMid - childMid) + tolerance < Math.max(childHeight, parentHeight * 0.75)) {
				return horizontalConnector(parentX, parentY, parentWidth, parentHeight, childX, childY, childWidth, childHeight);
			}
			childHorizontalOffset = parentX < childX ? 0 : 1;
			return {
				from: {
					x: parentX + 0.5 * parentWidth,
					y: parentY + 0.5 * parentHeight
				},
				to: {
					x: childX + childHorizontalOffset * childWidth,
					y: childY + 0.5 * childHeight
				},
				controlPointOffset: 0.75
			};
		}, function () {
			return Array.prototype.join.call(arguments, ',');
		}),
		updateDOMConnector = function (domElement) {
			var config = {
					stroke: '#888',
					width: 1
				},
				element = $(domElement),
				shapeFrom = $('#node_' + element.attr('data-connector-from')),
				shapeTo = $('#node_' + element.attr('data-connector-to')),
				calculatedConnector = calculateConnector(shapeFrom, shapeTo),
				from = calculatedConnector.from,
				to = calculatedConnector.to,
				position = {
					left: Math.min(shapeFrom.position().left, shapeTo.position().left),
					top: Math.min(shapeFrom.position().top, shapeTo.position().top),
				},
				offset = calculatedConnector.controlPointOffset * (from.y - to.y),
				maxOffset = Math.min(shapeTo.height(), shapeFrom.height()) * 1.5,
				straightLine = false,
				pathElement;
			position.width = Math.max(shapeFrom.position().left + shapeFrom.width(), shapeTo.position().left + shapeTo.width(), position.left + 1) - position.left;
			position.height = Math.max(shapeFrom.position().top + shapeFrom.height(), shapeTo.position().top + shapeTo.height(), position.top + 1) - position.top;
			element.css(position);
			if (straightLine) {
				element.empty();
				$(svg('line')).attr({
					x1: from.x - position.left,
					x2: to.x - position.left,
					y1: from.y - position.top,
					y2: to.y - position.top,
					style: 'stroke:' + config.stroke + ';stroke-width:' + config.width + 'px'
				}).appendTo(element);
			} else {
				offset = Math.max(-maxOffset, Math.min(maxOffset, offset));
				pathElement = element.find('path');
				if (pathElement.length === 0) {
					element.empty();
					pathElement = $(svg('path')).attr({
						fill: 'none',
						stroke: config.stroke,
						'stroke-width': config.width,
						'class': 'connector'
					}).appendTo(element);
				}
				pathElement.attr('d',
					'M' + (from.x - position.left) + ',' + (from.y - position.top) +
					'Q' + (from.x - position.left) + ',' + (to.y - offset - position.top) + ' ' + (to.x - position.left) + ',' + (to.y - position.top)
				);
			}
		},
		connectorsFor = function (nodeId) {
			return $('[data-connector-from=' + nodeId + ']').add('[data-connector-to=' + nodeId + ']');
		},
		updateNodeConnectors = function (nodeId) {
			_.each(connectorsFor(nodeId), updateDOMConnector);
		};

	mapModel.addEventListener('nodeSelectionChanged', function (ideaId, isSelected) {
		var node = $('#node_' + ideaId);
		if (isSelected) {
			node.addClass('selected');
			node.focus();
		} else {
			node.removeClass('selected');
		}
	});
	mapModel.addEventListener('nodeTitleChanged', function (node) {
		$('#node_' + node.id).find('.text').text(node.title);
	});
	mapModel.addEventListener('nodeRemoved', function (node) {
		$('#node_' + node.id).remove();
	});

	mapModel.addEventListener('nodeMoved', function (node /*, reason*/) {

		$('#node_' + node.id).data({
			'x': node.x,
			'y': node.y
		}).positionNode(stageElement);
		updateNodeConnectors(node.id);

		//onFinish: ensureSelectedNodeVisible.bind(undefined, node)
	});
	mapModel.addEventListener('connectorCreated', function (connector) {
		var	domConnector = $(svg('svg'))
			.attr({'id': connectorKey(connector), 'data-mapjs-role': 'connector', 'data-connector-from': connector.from, 'data-connector-to': connector.to})
			.appendTo(stageElement);
		updateDOMConnector(domConnector);
	});
	mapModel.addEventListener('connectorRemoved', function (connector) {
		$('#' + connectorKey(connector)).remove();
	});
	mapModel.addEventListener('nodeCreated', function (node) {
		$('<div>')
			.attr('tabindex', 0)
			.attr({ 'id': 'node_' + node.id, 'data-mapjs-role': 'node' })
			.data({ 'x': node.x, 'y': node.y})
			.addClass('mapjs-node')
			.appendTo(stageElement).on('click tap', function (evt) { mapModel.clickNode(node.id, evt); })
			.positionNode(stageElement)
			.updateNodeContent(node);
	});
};
$.fn.domMapWidget = function (activityLog, mapModel /*, touchEnabled */) {
	'use strict';
	var hotkeyEventHandlers = {
			'return': 'addSiblingIdea',
			'shift+return': 'addSiblingIdeaBefore',
			'del backspace': 'removeSubIdea',
			'tab insert': 'addSubIdea',
			'left': 'selectNodeLeft',
			'up': 'selectNodeUp',
			'right': 'selectNodeRight',
			'shift+right': 'activateNodeRight',
			'shift+left': 'activateNodeLeft',
			'shift+up': 'activateNodeUp',
			'shift+down': 'activateNodeDown',
			'down': 'selectNodeDown',
			'space f2': 'editNode',
			'f': 'toggleCollapse',
			'c meta+x ctrl+x': 'cut',
			'p meta+v ctrl+v': 'paste',
			'y meta+c ctrl+c': 'copy',
			'u meta+z ctrl+z': 'undo',
			'shift+tab': 'insertIntermediate',
			'Esc 0 meta+0 ctrl+0': 'resetView',
			'r meta+shift+z ctrl+shift+z meta+y ctrl+y': 'redo',
			'meta+plus ctrl+plus z': 'scaleUp',
			'meta+minus ctrl+minus shift+z': 'scaleDown',
			'meta+up ctrl+up': 'moveUp',
			'meta+down ctrl+down': 'moveDown',
			'ctrl+shift+v meta+shift+v': 'pasteStyle',
			'Esc': 'cancelCurrentAction'
		},
		charEventHandlers = {
			'[' : 'activateChildren',
			'{'	: 'activateNodeAndChildren',
			'='	: 'activateSiblingNodes',
			'.'	: 'activateSelectedNode',
			'/' : 'toggleCollapse',
			'a' : 'openAttachment',
			'i' : 'editIcon'
		},
		actOnKeys = true;
	mapModel.addEventListener('inputEnabledChanged', function (canInput) {
		actOnKeys = canInput;
	});


	return this.each(function () {
		var element = $(this),
			stage = $('<div>').css({width: '100%', height: '100%', position: 'relative'}).attr('data-mapjs-role', 'stage').appendTo(element);
		element.draggableContainer();
		stage.data('stage-x', element.innerWidth() / 2);
		stage.data('stage-y', element.innerHeight() / 2);
		MAPJS.domMediator(mapModel, stage);
		_.each(hotkeyEventHandlers, function (mappedFunction, keysPressed) {
			element.keydown(keysPressed, function (event) {
				if (actOnKeys) {
					event.preventDefault();
					mapModel[mappedFunction]('keyboard');
				}
			});
		});
		element.on('keypress', function (evt) {
			if (!actOnKeys) {
				return;
			}
			if (/INPUT|TEXTAREA/.test(evt && evt.target && evt.target.tagName)) {
				return;
			}
			var unicode = evt.charCode || evt.keyCode,
				actualkey = String.fromCharCode(unicode),
				mappedFunction = charEventHandlers[actualkey];
			if (mappedFunction) {
				evt.preventDefault();
				mapModel[mappedFunction]('keyboard');
			} else if (Number(actualkey) <= 9 && Number(actualkey) >= 1) {
				evt.preventDefault();
				mapModel.activateLevel('keyboard', Number(actualkey) + 1);
			}
		});
	});
};

// + shadows
// + selected
// + default and non default backgrounds for root and children
// + multi-line text
// + if adding a node to left/top coordinate beyond 0, expand the stage and move all nodes down, expand by a margin to avoid re-expanding all the time
// + images in background or as separate elements?
// + icon position
// + focus or selected?
//
//
//
// --------- read only ------------
// - scroll/swipe
// attachment - clip
// folded
//  click-tap to collapse/uncollapse
// custom connectors
// prevent scrolling so the screen is blank
// zoom
// hyperlinks
// animations
// perf test large maps
//
// --------- editing --------------
// - don't set contentEditable
// - enable drag & drop
// drop
// editing as span or as textarea - grow automatically
// drag background
// straight lines extension
// collaboration avatars
// activated
// mouse events
// mapwidget keyboard bindings
// mapwidget mouse bindings
// html export


// collaboration - collaborator images

// remaining kinetic mediator events
// -	mapModel.addEventListener('addLinkModeToggled', function (isOn) {
// -	mapModel.addEventListener('nodeEditRequested', function (nodeId, shouldSelectAll, editingNew) {
// +	mapModel.addEventListener('nodeCreated', function (n) {
// -	mapModel.addEventListener('nodeSelectionChanged', function (ideaId, isSelected) {
// -	mapModel.addEventListener('nodeFocusRequested', function (ideaId)  {
// -	mapModel.addEventListener('nodeAttrChanged', function (n) {
// -	mapModel.addEventListener('nodeDroppableChanged', function (ideaId, isDroppable) {
// +	mapModel.addEventListener('nodeRemoved', function (n) {
// +	mapModel.addEventListener('nodeMoved', function (n, reason) {
// +	mapModel.addEventListener('nodeTitleChanged', function (n) {
// +	mapModel.addEventListener('connectorCreated', function (n) {
// -	mapModel.addEventListener('layoutChangeComplete', function () {
// +	mapModel.addEventListener('connectorRemoved', function (n) {
// -	mapModel.addEventListener('linkCreated', function (l) {
// -	mapModel.addEventListener('linkRemoved', function (l) {
// -	mapModel.addEventListener('linkAttrChanged', function (l) {
// -	mapModel.addEventListener('mapScaleChanged', function (scaleMultiplier, zoomPoint) {
// -	mapModel.addEventListener('mapViewResetRequested', function () {
// -	mapModel.addEventListener('mapMoveRequested', function (deltaX, deltaY) {
// -	mapModel.addEventListener('activatedNodesChanged', function (activatedNodes, deactivatedNodes) {

// - node removed
// - node moved (esp reason = failed)
// no more memoization on calc connector - not needed
