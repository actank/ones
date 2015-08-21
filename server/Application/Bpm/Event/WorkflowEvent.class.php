<?php
/**
 * Created by PhpStorm.
 * User: nemo <335454250@qq.com>
 * Date: 7/15/15
 * Time: 22:22
 */

namespace Bpm\Event;


use Common\Event\BaseRestEvent;

class WorkflowEvent extends BaseRestEvent {

    /*
     * 「扩展方法」
     * 获取当前数据在工作流中的下一节点
     * */
    public function _EM_get_next_nodes() {
        $workflow_id = I('get.workflow_id');
        $source_id   = I('get.source_id');

        $check_permission = true;
        $next_nodes = D('Bpm/Workflow')->get_next_nodes($workflow_id, $source_id, $check_permission);

        $fields = explode(',', I('get._fd'));
        if($fields) {
            foreach($next_nodes as $k=>$node) {
                $next_nodes[$k] = filter_array_fields($node, $fields);
            }
        }

        $this->response($next_nodes, 'workflow_node', true);
    }

    /*
     * 「扩展方法」
     * 获取当前数据的工作流进程
     * */
    public function _EM_get_progress() {
        $workflow_id = I('get.workflow_id');
        $source_id   = I('get.source_id');

        $progresses = D('Bpm/WorkflowProgress')->get_progress($workflow_id, $source_id);
        $this->response($progresses, 'workflow_progress', true);
    }

    /*
     * 「扩展方法」
     * 执行工作流节点
     * */
    public function _EM_execute_node() {

        $source_id = I('get.source_id');
        $node_id   = I('get.node_id');

        $workflow = D('Bpm/Workflow');
        $result = $workflow->exec($source_id, [], $node_id);
        if(false === $result) {
            $this->error($workflow->getError());
        }
    }

}