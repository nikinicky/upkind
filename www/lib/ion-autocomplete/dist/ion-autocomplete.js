/*
 * ion-autocomplete 0.3.0
 * Copyright 2015 Danny Povolotski
 * Copyright modifications 2015 Guy Brand
 * https://github.com/guylabs/ion-autocomplete
 */
(function() {

'use strict';

angular.module('ion-autocomplete', []).directive('ionAutocomplete', [
    '$ionicBackdrop', '$ionicScrollDelegate', '$document', '$q', '$parse', '$ionicPlatform', '$compile', '$templateRequest',
    function ($ionicBackdrop, $ionicScrollDelegate, $document, $q, $parse, $ionicPlatform, $compile, $templateRequest) {
        return {
            require: ['ngModel', 'ionAutocomplete'],
            restrict: 'A',
            scope: {},
            bindToController: {
                ngModel: '=',
                templateData: '=',
                itemsMethod: '&',
                itemsClickedMethod: '&',
                itemsRemovedMethod: '&',
                modelToItemMethod: '&'
            },
            controllerAs: 'viewModel',
            controller: function ($attrs) {
                var valueOrDefault = function (value, defaultValue) {
                    return !value ? defaultValue : value;
                };

                // set the default values of the passed in attributes
                this.placeholder = valueOrDefault($attrs.placeholder, 'Click to enter a value...');
                this.cancelLabel = valueOrDefault($attrs.cancelLabel, $attrs.multipleSelect === "true" ? 'Done' : 'Cancel');
                this.selectItemsLabel = valueOrDefault($attrs.selectItemsLabel, 'Select an item...');
                this.selectedItemsLabel = valueOrDefault($attrs.selectedItemsLabel, 'Selected items:');
                this.templateUrl = valueOrDefault($attrs.templateUrl, undefined);
                this.itemsMethodValueKey = valueOrDefault($attrs.itemsMethodValueKey, undefined);
                this.itemValueKey = valueOrDefault($attrs.itemValueKey, undefined);
                this.itemViewValueKey = valueOrDefault($attrs.itemViewValueKey, undefined);
                this.multipleSelect = valueOrDefault($attrs.multipleSelect, undefined);
                this.componentId = valueOrDefault($attrs.componentId, undefined);
                this.loadingIcon = valueOrDefault($attrs.loadingIcon, undefined);

                // loading flag if the items-method is a function
                this.showLoadingIcon = false;

                // the items, selected items and the query for the list
                this.items = [];
                this.selectedItems = [];
                this.searchQuery = undefined;
            },
            link: function (scope, element, attrs, controllers) {

                // get the two needed controllers
                var ngModelController = controllers[0];
                var ionAutocompleteController = controllers[1];

                // use a random css class to bind the modal to the component
                var randomCssClass = "ion-autocomplete-random-" + Math.floor((Math.random() * 1000) + 1);

                var template = [
                    '<div class="ion-autocomplete-container ' + randomCssClass + ' modal" style="display: none;">',
                    '<div class="bar bar-header item-input-inset">',
                    '<label class="item-input-wrapper">',
                    '<i class="icon ion-search placeholder-icon"></i>',
                    '<input type="search" class="ion-autocomplete-search" ng-model="viewModel.searchQuery" placeholder="{{viewModel.placeholder}}"/>',
                    '</label>',
                    '<div class="ion-autocomplete-loading-icon" ng-if="viewModel.showLoadingIcon && viewModel.loadingIcon"><ion-spinner icon="{{viewModel.loadingIcon}}"></ion-spinner></div>',
                    '<button class="ion-autocomplete-cancel button button-clear">{{viewModel.cancelLabel}}</button>',
                    '</div>',
                    '<ion-content class="has-header">',
                    '<ion-item class="item-divider" ng-show="viewModel.selectedItems.length > 0">{{viewModel.selectedItemsLabel}}</ion-item>',
                    '<ion-item ng-repeat="selectedItem in viewModel.selectedItems track by $index" class="item-icon-left item-icon-right">',
                    '<i class="icon ion-checkmark"></i>',
                    '{{viewModel.getItemValue(selectedItem, viewModel.itemViewValueKey)}}',
                    '<i class="icon ion-trash-a" style="cursor:pointer" ng-click="viewModel.removeItem($index)"></i>',
                    '</ion-item>',
                    '<ion-item class="item-divider" ng-show="viewModel.items.length > 0">{{viewModel.selectItemsLabel}}</ion-item>',
                    '<ion-item collection-repeat="item in viewModel.items" item-height="55px" item-width="100%" ng-click="viewModel.selectItem(item)">',
                    '{{viewModel.getItemValue(item, viewModel.itemViewValueKey)}}',
                    '</ion-item>',
                    '</ion-content>',
                    '</div>'
                ].join('')

                // first check if a template url is set and use this as template
                if (ionAutocompleteController.templateUrl) {
                    $templateRequest(ionAutocompleteController.templateUrl).then(function (template) {
                        $document.find('body').append($compile(angular.element(template))(scope));
                    });
                } else {
                    // only append the container to the body if there is no container already present (if multiple components are used)
                    $document.find('body').append($compile(angular.element(template))(scope));
                }

                // returns the value of an item
                ionAutocompleteController.getItemValue = function (item, key) {

                    // if it's an array, go through all items and add the values to a new array and return it
                    if (angular.isArray(item)) {
                        var items = [];
                        angular.forEach(item, function (itemValue) {
                            if (key && angular.isObject(item)) {
                                items.push($parse(key)(itemValue));
                            } else {
                                items.push(itemValue);
                            }
                        });
                        return items;
                    } else {
                        if (key && angular.isObject(item)) {
                            return $parse(key)(item);
                        }
                    }
                    return item;
                };

                // get the compiled search field
                var searchInputElement = angular.element($document[0].querySelector('div.ion-autocomplete-container.' + randomCssClass + ' input'));

                // function which selects the item, hides the search container and the ionic backdrop if it is not a multiple select autocomplete
                ionAutocompleteController.selectItem = function (item) {

                    // clear the items and the search query
                    ionAutocompleteController.items = [];
                    ionAutocompleteController.searchQuery = undefined;

                    // if multiple select is on store the selected items
                    if (ionAutocompleteController.multipleSelect === "true") {

                        if (!isKeyValueInObjectArray(ionAutocompleteController.selectedItems,
                                ionAutocompleteController.itemValueKey, ionAutocompleteController.getItemValue(item, ionAutocompleteController.itemValueKey))) {
                            // create a new array to update the model. See https://github.com/angular-ui/ui-select/issues/191#issuecomment-55471732
                            ionAutocompleteController.selectedItems = ionAutocompleteController.selectedItems.concat([item]);
                        }

                        // set the view value and render it
                        ngModelController.$setViewValue(ionAutocompleteController.selectedItems);
                        ngModelController.$render();
                    } else {
                        // set the view value and render it
                        ngModelController.$setViewValue(item);
                        ngModelController.$render();

                        // hide the container and the ionic backdrop
                        hideSearchContainer();
                    }

                    // call items clicked callback
                    if (angular.isFunction(ionAutocompleteController.itemsClickedMethod)) {
                        ionAutocompleteController.itemsClickedMethod({
                            callback: {
                                item: item,
                                selectedItems: ionAutocompleteController.selectedItems.slice(),
                                componentId: ionAutocompleteController.componentId
                            }
                        });
                    }
                };

                // function which removes the item from the selected items.
                ionAutocompleteController.removeItem = function (index) {
                    // remove the item from the selected items and create a copy of the array to update the model.
                    // See https://github.com/angular-ui/ui-select/issues/191#issuecomment-55471732
                    var removed = ionAutocompleteController.selectedItems.splice(index, 1)[0];
                    ionAutocompleteController.selectedItems = ionAutocompleteController.selectedItems.slice();

                    // set the view value and render it
                    ngModelController.$setViewValue(ionAutocompleteController.selectedItems);
                    ngModelController.$render();

                    // call items clicked callback
                    if (angular.isFunction(ionAutocompleteController.itemsRemovedMethod)) {
                        ionAutocompleteController.itemsRemovedMethod({
                            callback: {
                                item: removed,
                                selectedItems: ionAutocompleteController.selectedItems.slice(),
                                componentId: ionAutocompleteController.componentId
                            }
                        });
                    }
                };

                // watcher on the search field model to update the list according to the input
                scope.$watch('viewModel.searchQuery', function (query) {

                    // right away return if the query is undefined to not call the items method for nothing
                    if (query === undefined) {
                        return;
                    }

                    // if the search query is empty, clear the items
                    if (query == '') {
                        ionAutocompleteController.items = [];
                    }

                    if (angular.isFunction(ionAutocompleteController.itemsMethod)) {

                        // show the loading icon
                        ionAutocompleteController.showLoadingIcon = true;

                        var queryObject = {query: query};

                        // if the component id is set, then add it to the query object
                        if (ionAutocompleteController.componentId) {
                            queryObject = {query: query, componentId: ionAutocompleteController.componentId}
                        }

                        // convert the given function to a $q promise to support promises too
                        var promise = $q.when(ionAutocompleteController.itemsMethod(queryObject));

                        promise.then(function (promiseData) {

                            // if the given promise data object has a data property use this for the further processing as the
                            // standard httpPromises from the $http functions store the response data in a data property
                            if (promiseData && promiseData.data) {
                                promiseData = promiseData.data;
                            }

                            // set the items which are returned by the items method
                            ionAutocompleteController.items = ionAutocompleteController.getItemValue(promiseData,
                                ionAutocompleteController.itemsMethodValueKey);

                            // force the collection repeat to redraw itself as there were issues when the first items were added
                            $ionicScrollDelegate.resize();

                            // hide the loading icon
                            ionAutocompleteController.showLoadingIcon = false;
                        }, function (error) {
                            // reject the error because we do not handle the error here
                            return $q.reject(error);
                        });
                    }
                });

                var searchContainerDisplayed = false;

                var displaySearchContainer = function () {
                    if (searchContainerDisplayed) {
                        return;
                    }
                    $ionicBackdrop.retain();
                    angular.element($document[0].querySelector('div.ion-autocomplete-container.' + randomCssClass)).css('display', 'block');
                    scope.$deregisterBackButton = $ionicPlatform.registerBackButtonAction(function () {
                        hideSearchContainer();
                    }, 300);
                    searchContainerDisplayed = true;
                };

                var hideSearchContainer = function () {
                    angular.element($document[0].querySelector('div.ion-autocomplete-container.' + randomCssClass)).css('display', 'none');
                    $ionicBackdrop.release();
                    scope.$deregisterBackButton && scope.$deregisterBackButton();
                    searchContainerDisplayed = false;
                };

                // object to store if the user moved the finger to prevent opening the modal
                var scrolling = {
                    moved: false,
                    startX: 0,
                    startY: 0
                };

                // store the start coordinates of the touch start event
                var onTouchStart = function (e) {
                    scrolling.moved = false;
                    // Use originalEvent when available, fix compatibility with jQuery
                    if (typeof(e.originalEvent) !== 'undefined') {
                        e = e.originalEvent;
                    }
                    scrolling.startX = e.touches[0].clientX;
                    scrolling.startY = e.touches[0].clientY;
                };

                // check if the finger moves more than 10px and set the moved flag to true
                var onTouchMove = function (e) {
                    // Use originalEvent when available, fix compatibility with jQuery
                    if (typeof(e.originalEvent) !== 'undefined') {
                        e = e.originalEvent;
                    }
                    if (Math.abs(e.touches[0].clientX - scrolling.startX) > 10 ||
                        Math.abs(e.touches[0].clientY - scrolling.startY) > 10) {
                        scrolling.moved = true;
                    }
                };

                // click handler on the input field to show the search container
                var onClick = function (event) {
                    // only open the dialog if was not touched at the beginning of a legitimate scroll event
                    if (scrolling.moved) {
                        return;
                    }

                    // prevent the default event and the propagation
                    event.preventDefault();
                    event.stopPropagation();

                    // show the ionic backdrop and the search container
                    displaySearchContainer();

                    // focus on the search input field
                    if (searchInputElement.length > 0) {
                        searchInputElement[0].focus();
                        setTimeout(function () {
                            searchInputElement[0].focus();
                        }, 0);
                    }

                    // force the collection repeat to redraw itself as there were issues when the first items were added
                    $ionicScrollDelegate.resize();
                };

                var isKeyValueInObjectArray = function (objectArray, key, value) {
                    for (var i = 0; i < objectArray.length; i++) {
                        if (ionAutocompleteController.getItemValue(objectArray[i], key) === value) {
                            return true;
                        }
                    }
                    return false;
                };

                // function to call the model to item method and select the item
                var resolveAndSelectModelItem = function (modelValue) {
                    // convert the given function to a $q promise to support promises too
                    var promise = $q.when(ionAutocompleteController.modelToItemMethod({modelValue: modelValue}));

                    promise.then(function (promiseData) {
                        // select the item which are returned by the model to item method
                        ionAutocompleteController.selectItem(promiseData);
                    }, function (error) {
                        // reject the error because we do not handle the error here
                        return $q.reject(error);
                    });
                };

                // bind the handlers to the click and touch events of the input field
                element.bind('touchstart', onTouchStart);
                element.bind('touchmove', onTouchMove);
                element.bind('touchend click focus', onClick);

                // cancel handler for the cancel button which clears the search input field model and hides the
                // search container and the ionic backdrop
                angular.element($document[0].querySelector('div.ion-autocomplete-container.' + randomCssClass + ' button')).bind('click', function (event) {
                    ionAutocompleteController.searchQuery = undefined;
                    hideSearchContainer();
                });

                // prepopulate view and selected items if model is already set
                if (ionAutocompleteController.ngModel && angular.isFunction(ionAutocompleteController.modelToItemMethod)) {
                    if (ionAutocompleteController.multipleSelect === "true" && angular.isArray(ionAutocompleteController.ngModel)) {
                        angular.forEach(ionAutocompleteController.ngModel, function (modelValue) {
                            resolveAndSelectModelItem(modelValue);
                        })
                    } else {
                        resolveAndSelectModelItem(ionAutocompleteController.ngModel);
                    }
                }

                // render the view value of the model
                ngModelController.$render = function () {
                    element.val(ionAutocompleteController.getItemValue(ngModelController.$viewValue, ionAutocompleteController.itemViewValueKey));
                };

                // set the view value of the model
                ngModelController.$formatters.push(function (modelValue) {
                    var viewValue = ionAutocompleteController.getItemValue(modelValue, ionAutocompleteController.itemViewValueKey);
                    return viewValue == undefined ? "" : viewValue;
                });

                // set the model value of the model
                ngModelController.$parsers.push(function (viewValue) {
                    return ionAutocompleteController.getItemValue(viewValue, ionAutocompleteController.itemValueKey);
                });

            }
        };
    }
]);
})();