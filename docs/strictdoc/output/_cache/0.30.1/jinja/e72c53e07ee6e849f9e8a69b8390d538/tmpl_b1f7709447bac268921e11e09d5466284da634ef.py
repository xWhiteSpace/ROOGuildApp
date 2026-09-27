from jinja2.runtime import LoopContext, Macro, Markup, Namespace, TemplateNotFound, TemplateReference, TemplateRuntimeError, Undefined, escape, identity, internalcode, markup_join, missing, str_join
name = 'components/switch/index.jinja'

def root(context, missing=missing):
    resolve = context.resolve_or_missing
    undefined = environment.undefined
    concat = environment.concat
    cond_expr_undefined = Undefined
    if 0: yield None
    pass
    yield '<template id="template-switch">\n  <label class="switch">\n    <span class="switch__label-text"></span>\n    <input type="checkbox" class="switch__input">\n    <span class="switch__slider"></span>\n  </label>\n</template>'

blocks = {}
debug_info = ''