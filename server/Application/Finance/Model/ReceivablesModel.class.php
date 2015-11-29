<?php

/*
 * @app Finance
 * @package Finance.model.Receivables
 * @author laofahai@TEam Swift
 * @link https://ng-erp.com
 * */
namespace Finance\Model;
use Common\Model\CommonViewModel;

class ReceivablesModel extends CommonViewModel {

    protected $viewFields = [
        "Receivables" => ['*', '_type'=>'left'],
        "CommonType" => [
            "name" => "common_type_id_label",
            "_on" => "Receivables.common_type_id=CommonType.id",
            "_type" => "left"
        ],
        "Workflow" => [
            "name" => "workflow_id_label",
            "_on" => "Receivables.workflow_id=Workflow.id",
            "_type" => "left"
        ]
    ];

}