/* eslint-disable no-unused-vars */
define([
  'core/js/adapt',
  'core/js/views/questionView',
  './draggabilly',
  './round',
  'core/js/notify',
  'core/js/device',
  'core/js/components'
], function(Adapt, QuestionView, Draggabilly, round, notify, device, components) {

  const Ppq = QuestionView.extend({
    events: {
      'click .ppq-pinboard': 'onPinboardClicked'
    },
    setupFeedback: function() {},

    render: function() {
      QuestionView.prototype.render.apply(this, arguments);

      // unsafe to run in postRender due to QuestionView deferreds
      this.setupPinboardImage(device.screenSize);
      this.setupCorrectZones();
      this.addPinViews();

      if (this.model.get('_isSubmitted')) this.showMarking();

      this.checkCompatibility();

      return this;
    },
    addPinViews: function() {
      const userAnswer = _.extend([], this.model.get('_userAnswer'));
      const isDesktop = device.screenSize !== 'small';

      // restore positions if submitted
      if (this.model.get('_isSubmitted') && userAnswer.length > 0) {
        userAnswer.shift();
      }

      // pre-population simplifies code
      for (let i = 0, l = this.model.get('_maxSelection'); i < l; i++) {
        const pin = new PinView({
          model: this.model
        });
        // Only set position if we have valid user answer data
        if (userAnswer.length > i * 2 + 1) {
          pin.setPosition(userAnswer[i * 2] / 100, userAnswer[i * 2 + 1] / 100);
        }
        this._pinViews.push(pin);
        this.$('.ppq-boundary').append(pin.$el);
      }
    },
    resetQuestionOnRevisit: function() {
      this.resetQuestion();
    },
    setupQuestion: function() {
      if (!this.model.has('_minSelection')) this.model.set('_minSelection', 1);
      this.model.set('_maxSelection', Math.max(this.model.get('_maxSelection') || 0, this.model.get('_items').length));
      this._pinViews = [];
      this.restoreUserAnswers();
    },
    setupPinboardImage: function(screenSize) {
      const imageObj = screenSize === 'small' ? this.model.get('_pinboardMobile') : this.model.get('_pinboardDesktop');
      if (imageObj) {
        this.$('img.ppq-pinboard').attr({
          src: imageObj.src,
          alt: imageObj.alt,
          title: imageObj.title
        });
      }
    },
    setupCorrectZones: function() {
      let props; const isDesktop = device.screenSize !== 'small';

      _.each(this.model.get('_items'), function(item, index) {
        props = isDesktop ? item.desktop : item.mobile;
        this.$('.ppq-correct-zone').eq(index).css({ left: props.left + '%', top: props.top + '%', width: props.width + '%', height: props.height + '%' });
      }, this);
    },
    restoreUserAnswers: function() {
      if (!this.model.get('_isSubmitted')) return;

      this.setQuestionAsSubmitted();
      this.markQuestion();
      this.setScore();
    },
    disableQuestion: function() {
      this.setAllItemsEnabled(false);
    },
    enableQuestion: function() {
      this.setAllItemsEnabled(true);
    },
    setAllItemsEnabled: function(isEnabled) {
      _.each(this._pinViews, function(pin) {
        if (pin.dragObj) {
          isEnabled ? pin.dragObj.enable() : pin.dragObj.disable();
        }
      });
    },
    updatePinPositions: function() {
      const $pinboard = this.$('.ppq-pinboard');
      const boardw = $pinboard.width();
      const boardh = $pinboard.height();
      let pin, pos;

      for (let i = 0, l = this._pinViews.length; i < l; i++) {
        pin = this._pinViews[i];
        pos = pin.getPosition();

        if (pos) {
          pin.$el.css({
            left: boardw * pos.percentX / 100 - pin.$el.width() / 2,
            top: boardh * pos.percentY / 100 - pin.$el.height()
          });
        }
      }
    },
    onQuestionRendered: function() {
      const $pinboardContainerInner = this.$('.ppq-pinboard-container-inner');
      $pinboardContainerInner.imageready(_.bind(function() {

        try {
          for (let i = 0, l = this._pinViews.length; i < l; i++) {
            const pin = this._pinViews[i];
            pin.dragObj = new Draggabilly(pin.el, {
              containment: $pinboardContainerInner
            });

            if (!this.model.get('_isEnabled')) pin.dragObj.disable();

            pin.dragObj.on('dragStart', _.bind(this.onDragStart, this, pin));
            pin.dragObj.on('dragEnd', _.bind(this.onDragEnd, this, pin));
          }
          this.setReadyStatus();
        } catch (error) {
          console.error('Error initializing Draggabilly:', error);
        }

      }, this));

      this.listenTo(Adapt, 'device:changed', this.onDeviceChanged);
      this.listenTo(Adapt, 'device:resize', this.updatePinPositions);
    },
    onDeviceChanged: function(screenSize) {
      this.setupPinboardImage(screenSize);

      this.setupCorrectZones();

      if (this.model.get('_resetPinsOnPinboardChange')) {
        if (this.model.get('_isSubmitted')) {
          this.checkCompatibility();
          this.$('.ppq-other-device').toggleClass('display-none', !this.model.get('_showOtherDeviceCompletionMessage'));
          this.$('.ppq-pinboard-container, .btn__container').toggleClass('display-none', this.model.get('_showOtherDeviceCompletionMessage'));
        } else {
          this.resetPins();
        }
      } else {
        this.updatePinPositions();
      }
    },
    checkCompatibility: function() {
      const isSubmitted = this.model.get('_isSubmitted');

      if (!isSubmitted) return;

      const isDesktop = device.screenSize !== 'small';
      const isUserAnswerDesktop = this.model.get('_userAnswer')[0] === 1;
      const resetPinsOnPinboardChange = this.model.get('_resetPinsOnPinboardChange');

      if (isSubmitted && isDesktop !== isUserAnswerDesktop && resetPinsOnPinboardChange) {
        this.model.set('_showOtherDeviceCompletionMessage', true);
      } else {
        this.model.set('_showOtherDeviceCompletionMessage', false);
      }
    },
    getNextUnusedPin: function() {
      for (let i = 0, l = this._pinViews.length; i < l; i++) {
        if (!this._pinViews[i].$el.is('.in-use')) return this._pinViews[i];
      }
      return null;
    },
    onPinboardClicked: function(event) { // when pinBoard is clicked
      event.preventDefault();

      const pin = this.getNextUnusedPin();
      if (!pin || this.$('.component-widget').is('.disabled')) return;

      // Get the pinboard and its position
      const $pinboard = this.$('.ppq-pinboard');
      const pinboardOffset = $pinboard.offset();

      // Calculate position relative to pinboard
      const x = event.pageX - pinboardOffset.left - 10;
      const y = event.pageY - pinboardOffset.top;

      // Get board dimensions
      const boardw = $pinboard.width();
      const boardh = $pinboard.height();

      // Position pin directly at click point
      pin.$el.css({
        position: 'absolute',
        left: x + 'px',
        top: y + 'px'
      });

      // Calculate percentages
      const percentX = 100 * x / boardw;
      const percentY = 100 * y / boardh;

      pin.setPosition(percentX, percentY);
    },
    canSubmit: function() {
      return this.$('.ppq-pin.in-use').length >= this.model.get('_minSelection');
    },
    storeUserAnswer: function() {
      const userAnswer = [device.screenSize === 'small' ? 0 : 1];
      let pin, pos;

      for (let i = 0, l = this._pinViews.length; i < l; i++) {
        pin = this._pinViews[i];
        pos = pin.getPosition();

        if (pos) userAnswer.push(round(pos.percentX * 100, -2), round(pos.percentY * 100, -2));
      }

      this.model.set('_userAnswer', userAnswer);
    },
    isCorrect: function() {
      const items = this.model.get('_items');
      const userAnswer = this.model.get('_userAnswer');
      const isDesktop = userAnswer[0];
      const map = new Array(items.length);

      for (let i = 1, l = userAnswer.length; i < l; i += 2) {
        const itemIndex = this.getIndexOfItem(userAnswer[i] / 100, userAnswer[i + 1] / 100, isDesktop);
        if (itemIndex !== -1) map[itemIndex] = true;
      }

      const hasAtLeastOneCorrect = _.indexOf(map, true) !== -1;
      const isFullyCorrect = _.compact(map).length === items.length;

      this.model.set('_isAtLeastOneCorrectSelection', hasAtLeastOneCorrect);

      if (!isFullyCorrect && hasAtLeastOneCorrect) {
        this.isPartlyCorrect();
        return false;
      }

      return isFullyCorrect;
    },
    isPartlyCorrect: function() {
      const isCorrect = this.model.get('_isCorrect');
      const hasAtLeastOneCorrect = this.model.get('_isAtLeastOneCorrectSelection');
      if (isCorrect) return false; // Only return true if we have some correct answers but not all
      if (hasAtLeastOneCorrect) {
        this.model.set('_isPartlyCorrect', true);
        return true;
      }
      return false;
    },
    markQuestion: function() {
      // Call parent markQuestion
      QuestionView.prototype.markQuestion.apply(this, arguments);
    },
    setScore: function() {
      const questionWeight = this.model.get('_questionWeight');
      const answeredCorrectly = this.model.get('_isCorrect');
      const score = answeredCorrectly ? questionWeight : 0;
      this.model.set('_score', score);
    },
    showMarking: function() {
      if (!this.model.get('_canShowMarking')) return;

      const map = new Array(this.model.get('_items').length);

      if (this.model.get('_shouldShowZones')) { // show zones if enabled
        this.$('.ppq-correct-zone').removeClass('display-none');
      }

      for (let i = 0, l = this._pinViews.length; i < l; i++) {
        const pin = this._pinViews[i];
        const pos = pin.getPosition();

        if (pos) {
          const itemIndex = this.getIndexOfItem(pos.percentX, pos.percentY);

          // if pin inside item mark as correct, but mark any others in same item as incorrect
          if (itemIndex !== -1 && !map[itemIndex]) {
            map[itemIndex] = true;
            pin.$el
              .addClass('ppq-correct-icon ppq-correct')
              .removeClass('ppq-incorrect-icon ppq-incorrect')
              .addClass('icon');
          } else {
            pin.$el
              .addClass('ppq-incorrect-icon ppq-incorrect')
              .removeClass('ppq-correct-icon ppq-correct')
              .addClass('icon');
          }
        }
      }
    },
    resetUserAnswer: function() {
      this.model.set({ _userAnswer: [] });
    },
    resetQuestion: function() {
      this.resetPins();
      this.model.set({ _isAtLeastOneCorrectSelection: false });
    },
    resetPins: function() {
      _.each(this._pinViews, function(pin) {
        pin.reset();
      });
    },
    showCorrectAnswer: function() {
      const isDesktop = device.screenSize !== 'small';
      const items = this.model.get('_items');
      const map = new Array(items.length);
      const free = []; // new Array();
      let i = 0; let l = 0; let pin; let zone;

      // map first correctly placed pin to item and log other pins as free for moving
      _.each(this._pinViews, function(pin, pinIndex) {
        const pos = pin.getPosition();
        const itemIndex = this.getIndexOfItem(pos.percentX, pos.percentY);
        if (itemIndex !== -1 && !map[itemIndex]) map[itemIndex] = true;
        else free.push(pin);
      }, this);

      // ensure every item has a pin
      for (l = items.length; i < l; i++) {
        if (!map[i]) {
          zone = isDesktop ? items[i].desktop : items[i].mobile;
          pin = free.shift();
          pin.setPosition(zone.left + zone.width / 2, zone.top + zone.height / 2);
        }
      }

      // remove any superfluous pins
      for (i = l, l = this._pinViews.length; i < l; i++) {
        pin = this._pinViews[i];
        pin.reset();
      }

      this.updatePinPositions();
    },
    hideCorrectAnswer: function() {
      const userAnswer = this.model.get('_userAnswer');
      let i = 1; let l = 0; let pin;

      for (l = userAnswer.length; i < l; i += 2) {
        pin = this._pinViews[(i - 1) >> 1];
        pin.setPosition(userAnswer[i] / 100, userAnswer[i + 1] / 100);
      }
      for (i = userAnswer.length - 1 >> 1, l = this._pinViews.length; i < l; i++) {
        pin = this._pinViews[i];
        pin.reset();
      }

      this.updatePinPositions();
    },
    // given a coordinate return the index of the containing item if found
    getIndexOfItem: function(x, y, desktop) {
      const isDesktop = _.isBoolean(desktop) ? desktop : device.screenSize !== 'small';
      const items = this.model.get('_items');
      for (let i = 0, l = items.length; i < l; i++) {
        const zone = isDesktop ? items[i].desktop : items[i].mobile;
        if (x >= zone.left && y >= zone.top && x < zone.left + zone.width && y < zone.top + zone.height) {
          return i;
        }
      }
      return -1;
    },
    onDragStart: function(pin, event) {
      // console.log('Drag Start');
    },
    onDragEnd: function(pin, event) {
      // console.log('Drag End');

      const $pinboard = this.$('.ppq-pinboard');
      const boardw = $pinboard.width();
      const boardh = $pinboard.height();
      const pos = pin.$el.position();
      const x = pos.left + pin.$el.width() / 2;
      const y = (pos.top + pin.$el.height()) - 25;
      const percentX = 100 * x / boardw;
      const percentY = 100 * y / boardh;
      pin.setPosition(percentX, percentY);
      // this.$('.ppq-debug').html(percentX+'%,'+percentY+'% '+x+'px,'+y+'px');
    }

  }, {
    template: 'ppq'
  });

  const PinView = Backbone.View.extend({
    tagName: 'a',
    className: 'ppq-pin',

    events: {
      'click .ppq-icon': 'preventDefault'
    },

    initialize: function() {
      this.state = new Backbone.Model();
      this.render();
      this.$el.attr('href', '#'); // this can be adjusted to display some information
      this.$el.on('click', function(e) {
        e.preventDefault(); // Prevents navigation
        return false;
      });
    },

    render: function() {
      const template = Handlebars.templates.ppqPin;
      this.$el.html(template());
      return this;
    },

    preventDefault: function(event) {
      event.preventDefault();
    },

    reset: function() {
      this.$el.removeClass('in-use ppq-correct-icon ppq-incorrect-icon');
      this.state.unset('position');
    },

    getPosition: function() {
      return this.state.get('position');
    },

    setPosition: function(percentX, percentY) {
      if (!this.isGraphable(percentX) || !this.isGraphable(percentY)) return;

      this.$el.addClass('in-use');
      this.state.set('position', {
        percentX,
        percentY
      });
    },

    isGraphable: function(o) {
      return _.isNumber(o) && !isNaN(o) && isFinite(o);
    }
  });

  components.register('ppq', Ppq);
  return Ppq;
});
