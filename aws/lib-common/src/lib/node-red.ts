export interface NodeRedNode {
    id: string
    type: string
    [key: string]: any
}

export interface NodeRedFlowNode extends NodeRedNode {
    x: number
    y: number
    z: string
    wires: string[][]
}

export interface NodeRedFlowConfig extends NodeRedNode {
    z: string
}

export interface NodeRedFlow {
    id: string
    label: string
    disabled?: boolean
    info: string
    nodes: NodeRedFlowNode[]
    configs?: NodeRedFlowConfig[]
}
