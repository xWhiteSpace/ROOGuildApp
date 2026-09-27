from jinja2.runtime import LoopContext, Macro, Markup, Namespace, TemplateNotFound, TemplateReference, TemplateRuntimeError, Undefined, escape, identity, internalcode, markup_join, missing, str_join
name = 'features/tree_map/viewtype.jinja'

def root(context, missing=missing):
    resolve = context.resolve_or_missing
    undefined = environment.undefined
    concat = environment.concat
    cond_expr_undefined = Undefined
    if 0: yield None
    pass
    yield '<div\n  class="viewtype tree-map-viewtype"\n  data-testid="tree-map-selector"\n>\n  <div\n    class="viewtype__handler"\n    data-dropdown-handler\n    data-testid="tree-map-selector-handler"\n    aria-expanded="false"\n    aria-controls="tree-map-selector-menu"\n  >\n    <span\n      id="tree-map-selector-label"\n      data-testid="tree-map-selector-label"\n    >Tree map</span>\n    '
    template = environment.get_template('icons/ico16_expand.svg', 'features/tree_map/viewtype.jinja')
    gen = template.root_render_func(template.new_context(context.get_all(), True, {}))
    try:
        for event in gen:
            yield event
    finally: gen.close()
    yield '\n  </div>\n  <menu\n    class="dropdown_menu"\n    id="tree-map-selector-menu"\n    data-testid="tree-map-selector-menu"\n    aria-hidden="true"\n    aria-labelledby="tree-map-selector-label"\n  >\n    <li class="dropdown_menu_header">TREE MAPS</li>\n  </menu>\n</div>'

blocks = {}
debug_info = '16=12'