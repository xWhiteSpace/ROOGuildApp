from jinja2.runtime import LoopContext, Macro, Markup, Namespace, TemplateNotFound, TemplateReference, TemplateRuntimeError, Undefined, escape, identity, internalcode, markup_join, missing, str_join
name = 'features/tree_map/tips.jinja'

def root(context, missing=missing):
    resolve = context.resolve_or_missing
    undefined = environment.undefined
    concat = environment.concat
    cond_expr_undefined = Undefined
    if 0: yield None
    parent_template = None
    pass
    parent_template = environment.get_template('components/modal/index.jinja', 'features/tree_map/tips.jinja')
    for name, parent_block in parent_template.blocks.items():
        context.blocks.setdefault(name, []).append(parent_block)
    yield from parent_template.root_render_func(context)

def block_modal_container(context, missing=missing):
    resolve = context.resolve_or_missing
    undefined = environment.undefined
    concat = environment.concat
    cond_expr_undefined = Undefined
    if 0: yield None
    _block_vars = {}
    pass
    yield '\n      <div data-testid="tree-map-tips-content">\n        <h3>Tree map tips</h3>\n\n        <p>\n          Use the selector in the page header to switch maps.\n        </p>\n        <p>\n          Hold <kbd>Shift</kbd> while pointing at a tile to see its title, MID, and UID.\n        </p>\n        <p>\n          <kbd>Shift</kbd>+<kbd>Click</kbd> opens a node preview. For a document tile, it opens the document in a new tab.\n        </p>\n        <p>\n          <kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>Click</kbd> opens the corresponding Document view in a new tab.\n        </p>\n        <p>Move the pointer over the tree map area to use these shortcuts:</p>\n        <ul class="tree-map-tips__shortcuts">\n          <li>\n            <kbd class="tree-map-tips__key">'
    template = environment.get_template('icons/ico16_backspace.svg', 'features/tree_map/tips.jinja')
    gen = template.root_render_func(template.new_context(context.get_all(), True, {}))
    try:
        for event in gen:
            yield event
    finally: gen.close()
    yield '</kbd>\n            "Backspace" returns to the previous view recorded in the breadcrumb.\n          </li>\n          <li>\n            <kbd class="tree-map-tips__key">⏶</kbd>\n            open the parent folder.\n          </li>\n          <li>\n            <kbd class="tree-map-tips__key">⏴</kbd>\n            <kbd class="tree-map-tips__key">⏵</kbd>\n            move between neighboring items.\n          </li>\n        </ul>\n\n        <p>When a control or folder has keyboard focus:</p>\n        <ul class="tree-map-tips__shortcuts">\n          <li>\n            <kbd class="tree-map-tips__key tree-map-tips__key--text">Enter</kbd>\n            or\n            <kbd class="tree-map-tips__key tree-map-tips__key--text">Space</kbd>\n            activates it.\n          </li>\n          <li>\n            <kbd class="tree-map-tips__key tree-map-tips__key--text">Tab</kbd>\n            moves to the next control.\n          </li>\n          <li>\n            <kbd class="tree-map-tips__key tree-map-tips__key--text">Shift</kbd>\n            +\n            <kbd class="tree-map-tips__key tree-map-tips__key--text">Tab</kbd>\n            moves to the previous one.\n          </li>\n        </ul>\n      </div>'

blocks = {'modal_container': block_modal_container}
debug_info = '1=12&2=17&21=26'