from jinja2.runtime import LoopContext, Macro, Markup, Namespace, TemplateNotFound, TemplateReference, TemplateRuntimeError, Undefined, escape, identity, internalcode, markup_join, missing, str_join
name = 'features/tree_map/header__actions.jinja'

def root(context, missing=missing):
    resolve = context.resolve_or_missing
    undefined = environment.undefined
    concat = environment.concat
    cond_expr_undefined = Undefined
    if 0: yield None
    pass
    yield '<div class="tree-map-header-toolbar">\n  <button\n    class="action_button"\n    data-testid="tree-map-tips-button"\n    data-js-modal-template-trigger="tree-map-tips-modal-template"\n    type="button"\n  >?</button>\n</div>'

blocks = {}
debug_info = ''