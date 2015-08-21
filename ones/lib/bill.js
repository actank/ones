(function(window, angular, ones, io) {

    'use strict';

    angular.module('ones.billModule', ['ones.formFieldsModule'])
        .service('BillModule', [
            '$routeParams',
            '$timeout',
            '$injector',
            '$parse',
            '$compile',
            '$aside',

            'PageSelectedActions',
            'RootFrameService',
            'ones.form_fields_factory',
            function($routeParams, $timeout, $injector, $parse, $compile, $aside, PageSelectedActions, RootFrameService, field_factory) {
                var self = this;
                // 单据基本配置
                this.opts = {
                    // 初始显示行
                    init_rows: 9,
                    // 是否自动生成编号
                    bill_no: {
                        prefix: '' // 前缀
                        , bar_code_container: '#bar-code' // img container id <div id="bar-code"></div>
                        , field: 'bill_no' // bar code 存储ID
                        , display_value: true // 是否显示字符
                        , height: 50
                        , fontSize: 14
                        , value: generate_bill_no()
                    }
                };

                this.init = function(scope, opts) {
                    this.scope = scope;
                    this.parentScope = scope.$parent;

                    // 基本信息
                    this.parentScope.bill_meta_data = this.parentScope.bill_meta_data || {};

                    angular.deep_extend(this.opts, opts);

                    if(!opts.model || !opts.model.config.bill_row_model) {
                        RootFrameService.alert(_('common.Can not found bill row model'));
                        return false;
                    }

                    // 行model
                    this.row_model = $injector.get(opts.model.config.bill_row_model);
                    this.scope.bill_rows = [];

                    this.parentScope.system_preference = ones.system_preference;

                    this.run();
                };

                /*
                * 载入编辑数据
                * @param array|undefined data 默认数据 => {meta: {}, rows: []}
                * */
                this.load_edit_data = function(data) {
                    if(data) {
                        if(!data.meta || !data.rows) {
                            RootFrameService.alert({
                                content: _('common.Bill Init Data Parse Error'),
                                type: 'danger'
                            });
                            return false;
                        }
                        angular.deep_extend(self.parentScope.bill_meta_data, data.meta);
                        self.scope.bill_rows = data.rows;
                        self.max_tr_id = data.rows.length+1;

                        generate_bar_code();
                        return;
                    }

                    var p = {
                        id: $routeParams.id,
                        _ir: true // include_rows
                    };
                    self.opts.model.resource.get(p).$promise.then(function(response_data){
                        angular.deep_extend(
                            self.parentScope.bill_meta_data,
                            format_rest_data(response_data.meta, self.opts.model.config.fields)
                        );

                        var rows = response_data.rows;
                        if(response_data.meta.locked && $routeParams.action === 'edit') {
                            RootFrameService.close();
                            return RootFrameService.alert({
                                type: 'danger',
                                content: _('common.This item is locked and can not be edit')
                            });
                        }
                        angular.forEach(rows, function(row, k) {
                            angular.forEach(row, function(value, field) {
                                if(!row[field+'__label__']) {
                                    if(self.row_model.config.fields[field] && typeof self.row_model.config.fields[field].get_display === 'function') {
                                        rows[k][field+'__label__'] = self.row_model.config.fields[field].get_display(value, row);
                                    } else {
                                        rows[k][field+'__label__'] = value;
                                    }
                                }
                            });
                        });

                        self.scope.$root.current_item = self.parentScope.bill_meta_data;

                        self.scope.bill_rows = rows;

                        // 获取工作流按钮
                        if(self.opts.model.config.workflow) {
                            var _fd = [
                                'id', 'label'
                            ];
                            $injector.get('Bpm.WorkflowAPI').get_next_nodes(response_data.meta.workflow_id, response_data.meta.id, _fd)
                                .then(function(next_nodes){
                                    self.parentScope.$parent.workflow_in_bill = next_nodes;
                                });
                        }

                        generate_bar_code();
                    });

                };

                this.run = function() {
                    // 编辑模式
                    if($routeParams.id) {
                        this.opts.isEdit = true;

                        // 修改/删除等按钮
                        self.scope.$root.display_selected_actions_directly = true;
                        self.scope.$root.selectedActions = PageSelectedActions.generate(self.opts.model, self.parentScope);

                    } else {
                        // 行初始信息
                        for(var i=0;i<this.opts.init_rows;i++) {
                            self.scope.bill_rows.push({
                                tr_id: i
                            });
                        }
                        this.max_tr_id = this.opts.init_rows;

                        // 标题
                        this.parentScope.bill_meta_data.subject = this.opts.subject;

                        // 条码
                        if(this.opts.bill_no !== false) {
                            $timeout(function() {
                                generate_bar_code();
                            });
                        }
                    }

                    // 行字段
                    this.scope.row_fields = this.row_model.config.bill_fields;
                    this.scope.column_defs = this.row_model.config.fields;
                    this.scope.batch_select = {};

                    angular.forEach(this.scope.column_defs, function(config, field) {

                        config.field = config.field || field;

                        if(!config.field_model) {
                            self.scope.column_defs[field].field_model = field;
                        }

                        if(!config.field_label_model) {
                            self.scope.column_defs[field].field_label_model = field+'__label__';
                        }

                        if(!config['ng-model']) {
                            self.scope.column_defs[field]['ng-model'] = 'bill_rows[$parent.$index].' + field;
                        }

                        // 批量选择
                        if(config.batch_select) {
                            var batch_data_source = $injector.get(config.data_source);
                            batch_data_source.resource.api_query().$promise.then(function(data) {
                                self.scope.batch_select[field] = [];
                                var valueField = batch_data_source.config.value_field||'id';
                                angular.forEach(data, function(item) {
                                    self.scope.batch_select[field].push({
                                        value: item[valueField],
                                        label: typeof batch_data_source.unicode === 'function' ?
                                            batch_data_source.unicode(item) :
                                            item[batch_data_source.config.label_field||'name']
                                    });
                                });
                            });
                        }

                    });

                    // 批量设定
                    this.scope.batch_set_value = function(field, batch) {
                        var i = 0;
                        var cells = $('td[data-field="'+field+'"]');
                        angular.forEach(self.scope.bill_rows, function(item, key) {
                            self.scope.bill_rows[key][field] = batch.value;
                            self.scope.bill_rows[key][field + '__label__'] = batch.label;
                            i++;
                        });
                    };

                    // 增删行
                    this.scope.add_row = function(index) {
                        self.scope.bill_rows.splice(index, 0, {
                            tr_id: self.max_tr_id
                        });
                        self.max_tr_id++;
                    };
                    this.scope.del_row = function(index) {
                        self.scope.bill_rows.splice(index, 1);
                    };

                    // 单元格初始化
                    this.scope.cell_init = function(column_def, td, form_name, td_scope) {


                        var tr_id = td.data('row-index');

                        column_def['ng-model'] = form_name + '.' + column_def.field;
                        column_def['label-model'] = form_name + '.' + column_def.field + '__label__';
                        column_def.id = randomString('6')+'_'+column_def.field;

                        self.scope.column_defs[column_def.field] = column_def;
                        td.attr('data-inited', 'true');

                        var html = field_factory.make_field(td_scope, column_def.field, column_def, column_def.opts || {
                            container_tpl: '%(input)s',
                            form_name: form_name
                        });

                        td.append($compile(html)(td_scope || self.scope));

                        $timeout(function(){
                            td.find('>:last').addClass('bill_editable_widget').addClass('hide');
                        });

                    };

                    /*
                    * 单据数据格式化方法
                    * */
                    this.format_bill_data = function() {
                        var bill_rows = angular.copy(self.scope.bill_rows);
                        var bill_meta = angular.copy(self.scope.$parent.bill_meta_data);
                        var bill_rows_cleared = [];
                        var required_field_lang = [];

                        // 检测基本信息
                        for(var i=0; i<self.opts.model.config.bill_meta_required.length; i++) {
                            var required = self.opts.model.config.bill_meta_required[i];
                            if(!bill_meta[required]) {
                                required_field_lang.push(_(ones.app_info.app+'.'+ camelCaseSpace(required)));
                            }
                        }
                        if(required_field_lang.length > 0) {
                            RootFrameService.alert({
                                content: _('common.Please fill out the form correctly') + ': ' + required_field_lang.join(', '),
                                type: 'danger'
                            });
                            return false;
                        }

                        // 检测必须字段， 非法行将被丢弃
                        // @todo 检测时是否仅检测undefined
                        if(self.row_model.config.bill_row_required) {
                            var required = self.row_model.config.bill_row_required;
                            angular.forEach(bill_rows, function(item, index) {
                                for(var i=0;i<required.length;i++) {
                                    if(!item[required[i]]) {
                                        return;
                                    }
                                }

                                // 检测行数据中的无用临时数据
                                delete(item['tr_id']);
                                angular.forEach(item, function(v, k) {
                                    if(k.end_with('__')) {
                                        delete(item[k]);
                                    }
                                });
                                bill_rows_cleared.push(item);
                            });
                        }

                        // 无明细行
                        if(bill_rows_cleared.length <= 0) {
                            RootFrameService.alert({
                                content: _('common.Please fill out the form correctly'),
                                type: 'danger'
                            });
                            return false;
                        }
                        // 数据格式化
                        bill_meta = post_data_format(bill_meta);

                        return {
                            meta: bill_meta,
                            rows: bill_rows_cleared
                        };
                    };

                    /*
                    * 单据提交方法
                    * */
                    this.parentScope.do_bill_submit = function() {
                        var post_data = self.format_bill_data();
                        if(false === post_data) {
                            return false;
                        }
                        var callback = function(response_data) {
                            if(!response_data.error) {
                                RootFrameService.close();
                            }

                            if(is_app_loaded('messageCenter')) {
                                var mc = $injector.get('ones.MessageCenter');
                                mc.emit('some_data_changed', {
                                    sign_id: ones.caches.getItem('company_sign_id'),
                                    user_id: ones.user_info.id,
                                    app: ones.app_info.app,
                                    module: ones.app_info.module
                                });
                            }

                        };
                        // 提交
                        if(self.opts.isEdit) {
                            self.opts.model.resource.update({id: $routeParams.id}, post_data).$promise.then(callback);
                        } else {
                            self.opts.model.resource.save(post_data).$promise.then(callback);
                        }

                    };

                    // 载入编辑数据
                    if($routeParams.id) {
                        self.load_edit_data();
                    }
                };

                // 生成单据条码
                var generate_bar_code = function() {
                    var bar_code = self.opts.isEdit ? self.parentScope.bill_meta_data[self.opts.bill_no.field] : self.opts.bill_no.value;

                    if(!bar_code) {
                        return;
                    }

                    $(self.opts.bill_no.bar_code_container).append('<img />');
                    $timeout(function() {
                        $(self.opts.bill_no.bar_code_container + ' img').JsBarcode(bar_code, {
                            height: self.opts.bill_no.height,
                            displayValue: self.opts.bill_no.display_value
                        });
                    });

                    self.parentScope.bill_meta_data[self.opts.bill_no.field] = bar_code;
                };



            }
        ])
        .directive("bill", [
            "$compile", "$timeout", "GridView", "$filter", "BillModule",
            function($compile, $timeout, GridView, $filter, bill) {
                return {
                    restrict: "E",
                    replace: true,
                    transclusion: true,
                    templateUrl: "views/billTemplate.html",
                    scope: {
                        config: "="
                    },
                    link: function(scope, element, attrs) {
                        bill.init(scope, scope.$parent.$eval(attrs.config));
                    }
                };
            }
        ])
        // 可编辑区域
        .directive("billEditAble", [
            '$timeout',
            '$compile',
            '$parse',
            '$routeParams',
            'ones.form_fields_factory',
            function($timeout, $compile, $parse, $routeParams, field_factory) {
                return {
                    link: function(scope, ele, attrs) {

                        var self = {};
                        self.inited = false;

                        // 字段配置
                        var column_def = {};

                        var bind_element_event = function(element, is_td) {

                            if(is_td) {
                                td = $(element);
                            } else {
                                var td = $(element).parent();
                            }

                            td = $(td.context);
                            if(td.data('inited') == true) {
                                self.inited = true;
                            }

                            // 依赖其他字段时
                            if(column_def.editable_required) {
                                if(!angular.isArray(column_def.editable_required)) {
                                    column_def.editable_required = [column_def.editable_required];
                                }

                                for(var i=0;i<column_def.editable_required.length;i++) {
                                    var req = column_def.editable_required[i];
                                    var required_model = column_def['ng-model'].split('.').slice(0, -1).join('.') + '.' + req;
                                    var required_val = scope.$eval(required_model);
                                    if(!required_val) {
                                        return;
                                    }
                                }
                            }

                            var tr_id = td.data('row-index');
                            var form_name = column_def.form_name || 'bill_rows[$parent.$index]';

                            // 未初始化情况下，初始化输入控件
                            if(!self.inited) {
                                scope.$parent.cell_init(column_def, td, form_name, scope);
                                self.inited = true;
                            }

                            $timeout(function() {
                                element.find('label.bill_row_td_editable_label').addClass('hide');
                                element.find('.bill_editable_widget').removeClass('hide');
                                $(element).find('input.form-control').focus();
                                //$(element).find('input.form-control').select();
                            });

                            // 失去焦点事件
                            ele.delegate('input.form-control', 'blur', function() {
                                // 隐藏输入框
                                setTimeout(function() {
                                    ele.find('.bill_editable_widget').addClass('hide');
                                    ele.find('label.bill_row_td_editable_label').removeClass('hide');
                                }, 50);

                                // 检测label model 是否已正确
                                $timeout(function(){
                                    var label_value = scope.$eval(column_def['label-model']);
                                    var old_label_value = angular.copy(label_value);
                                    if(typeof column_def.get_display === 'function') {
                                        label_value = column_def.get_display(
                                            scope.$eval(column_def['ng-model']), // value
                                            scope.$eval(form_name)// row item
                                        );
                                        if(label_value === false) {
                                            return;
                                        }
                                        var getter = $parse(column_def['label-model']);
                                        getter.assign(scope, label_value || old_label_value);
                                    } else {
                                        var getter = $parse(column_def['label-model']);
                                        getter.assign(scope, old_label_value || scope.$eval(column_def['ng-model']));
                                    }
                                });

                                bind_before_and_after(column_def);

                            });

                            //回车事件
                            //ele.delegate('input.form-control', 'keydown', function(event) {
                            //    if(event.keyCode === KEY_CODES.ENTER) {
                            //        $(this).trigger('blur');
                            //    }
                            //});
                        };

                        // 绑定单元格前置和后置
                        var bind_before_and_after = function(column_def) {
                            var form_name = column_def.form_name || 'bill_rows[$parent.$index]';
                            // 单元格后置
                            if(typeof column_def.get_bill_cell_after === 'function') {
                                var after = column_def.get_bill_cell_after(
                                    scope.$eval(column_def['ng-model']), // value
                                    scope.$eval(form_name)// row item
                                );
                                var getter = $parse(column_def['ng-model'] + '__after__');
                                if(angular.isObject(after) && 'then' in after) {
                                    after.then(function(string) {
                                        getter.assign(scope, string);
                                    });
                                } else {
                                    getter.assign(scope, after);
                                }
                            }

                            // 单元格前置
                            if(typeof column_def.get_bill_cell_before === 'function') {
                                var before = column_def.get_bill_cell_before(
                                    scope.$eval(column_def['ng-model']), // value
                                    scope.$eval(form_name)// row item
                                );
                                var getter = $parse(column_def['ng-model'] + '__before__');
                                if(angular.isObject(before) && 'then' in before) {
                                    before.then(function(string) {
                                        getter.assign(scope, string);
                                    });
                                } else {
                                    getter.assign(scope, before);
                                }
                            }
                        };

                        /*
                        * @todo 产品属性模型远程字段配置后，同步更新row_model.fields
                        * @bug
                        * */
                        $timeout(function() {
                            // 字段配置
                            column_def = scope.$parent.$eval(attrs.billEditAble);

                            if($routeParams.id) {
                                bind_before_and_after(column_def);
                            }

                            // 锁定状态，并且非强制可编辑时
                            if(scope.$parent.$parent.$parent.bill_meta_data.locked && !column_def.force_editable) {
                                return;
                            }

                            if(column_def.editable === false) {
                                return;
                            }

                            //ele.delegate('label', 'click', function() {
                            //    bind_element_event(ele);
                            //});
                            ele.bind('click', function() {
                                bind_element_event(ele, true);
                            });
                        }, 800);

                    }
                };
            }
        ])
    ;

})(window, window.angular, window.ones, window.io);