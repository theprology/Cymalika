import json,sys,os,subprocess,ctypes,ctypes.util

def fail(message): raise RuntimeError(message)
def command(args): return subprocess.check_output(args, text=True, timeout=4).strip()
def identity(pid):
    with open('/proc/%d/stat'%pid) as f:
        return '%d:%s'%(pid,f.read().rsplit(')',1)[1].split()[19])
def same_window_tree(pointer, target):
    library=ctypes.util.find_library('X11')
    if not library: fail('The X11 window library is unavailable.')
    x=ctypes.CDLL(library)
    window_type=ctypes.c_ulong
    x.XOpenDisplay.argtypes=[ctypes.c_char_p];x.XOpenDisplay.restype=ctypes.c_void_p
    x.XCloseDisplay.argtypes=[ctypes.c_void_p]
    x.XQueryTree.argtypes=[ctypes.c_void_p,window_type,ctypes.POINTER(window_type),ctypes.POINTER(window_type),ctypes.POINTER(ctypes.POINTER(window_type)),ctypes.POINTER(ctypes.c_uint)]
    x.XFree.argtypes=[ctypes.c_void_p]
    display=x.XOpenDisplay(None)
    if not display: fail('Cannot inspect the X11 pointer window.')
    def beneath(child, ancestor):
        for _ in range(20):
            root=window_type();parent=window_type();children=ctypes.POINTER(window_type)();count=ctypes.c_uint()
            ok=x.XQueryTree(display,child,ctypes.byref(root),ctypes.byref(parent),ctypes.byref(children),ctypes.byref(count))
            if children: x.XFree(children)
            if not ok or child==root.value: return False
            if child==ancestor: return True
            child=parent.value
            if not child: return False
        return False
    try: return beneath(pointer,target) or beneath(target,pointer)
    finally: x.XCloseDisplay(display)

def main(a):
    try:
        import gi
        gi.require_version('Atspi','2.0')
        from gi.repository import Atspi
    except (ImportError,ValueError): fail('Install python3-gi and gir1.2-atspi-2.0 to enable Linux accessibility tools.')
    desktop=Atspi.get_desktop(0)
    if desktop is None: fail('No accessibility desktop is available. Enable accessibility in your desktop session.')
    own_executable=os.readlink('/proc/%d/exe'%a.get('ownPid',os.getpid()))
    def apps():
        result=[]
        for i in range(desktop.get_child_count()):
            app=desktop.get_child_at_index(i)
            try:
                pid=app.get_process_id()
                if pid and pid != a.get('ownPid') and os.readlink('/proc/%d/exe'%pid)!=own_executable: result.append((app,identity(pid),pid))
            except Exception: pass
        return result
    op=a['operation']
    if op=='status': return {'accessibility':True,'screenRecording':os.environ.get('XDG_SESSION_TYPE')!='wayland','detail':'AT-SPI accessibility. Pointer/key input and window capture require X11; Wayland supports exposed accessibility actions.'}
    if op in ('installed','launch'):
        from gi.repository import Gio
        known={entry.get_id():entry for entry in Gio.AppInfo.get_all() if entry.get_id() and entry.should_show() and not entry.get_id().startswith('dev.theprology.cipher') and entry.get_display_name()!='Cipher'}
        if op=='installed': return [{'id':key,'name':entry.get_display_name()} for key,entry in sorted(known.items(),key=lambda item:item[1].get_display_name())][:250]
        entry=known.get(a.get('app'))
        if entry is None: fail('Choose an installed app ID from computer_apps.')
        entry.launch([],None)
        return {'status':'opened','app':a['app'],'next':'Call computer_apps to discover its running app ID, then computer_read.'}
    if op=='apps': return [{'id':ident,'name':app.get_name() or str(pid)} for app,ident,pid in apps()]
    matches=[(app,pid) for app,ident,pid in apps() if ident==a.get('app')]
    if not matches: fail('The allowed application exited or restarted. Choose it again in Access.')
    app,pid=matches[0]
    def secure(e): return e.get_role()==Atspi.Role.PASSWORD_TEXT
    def window():
        if os.environ.get('XDG_SESSION_TYPE')=='wayland': fail('Wayland compositor permission is required for screenshots and pointer/keyboard input. Use accessibility actions, or an X11 desktop session.')
        try:
            for line in command(['wmctrl','-lp']).splitlines():
                parts=line.split(None,4)
                if len(parts)>=3 and int(parts[2])==pid: return int(parts[0],16)
        except (OSError,ValueError): fail('Install wmctrl and xdotool for X11 window and input tools.')
        fail('No visible X11 window belongs to the allowed application.')
    def resolve(locator):
        e=app
        for index in locator['path']: e=e.get_child_at_index(index)
        if secure(e) or e.get_role_name()!=locator['role'] or e.get_name()!=locator['name']: fail('The element changed. Inspect the app again.')
        return e
    if op=='read':
        rows=[]; visited=0; warnings=[]
        def visit(e,path,depth):
            nonlocal visited
            if visited>=350 or len(rows)>=120 or depth>=14: return
            visited+=1
            if secure(e): rows.append({'role':'secure field','label':'[redacted]'}); return
            if not a.get('include_menus') and e.get_role()==Atspi.Role.MENU_BAR: return
            name=e.get_name() or ''; role=e.get_role_name(); value=''; editable=False; actions=[]
            try:
                text=e.get_text_iface()
                if text: value=(Atspi.Text.get_text(text,0,min(1200,Atspi.Text.get_character_count(text))) or '')[:1200]
            except Exception as error:
                if len(warnings)<3: warnings.append('Text: '+str(error))
            try: editable=e.get_editable_text_iface() is not None
            except Exception: pass
            try:
                action=e.get_action_iface()
                if action: actions=[action.get_action_name(i) for i in range(action.get_n_actions())]
            except Exception: pass
            if name or value or editable or actions:
                bounds=None
                try:
                    rect=Atspi.Component.get_extents(e.get_component_iface(),Atspi.CoordType.SCREEN)
                    bounds={'x':rect.x,'y':rect.y,'width':rect.width,'height':rect.height}
                except Exception: pass
                rows.append({'id':str(len(rows)),'label':name[:220],'role':role,'value':value,'editable':editable,'actions':actions,'depth':depth,'bounds':bounds,'locator':{'path':path,'role':role,'name':name}})
            for i in range(min(e.get_child_count(),350)):
                try: visit(e.get_child_at_index(i),path+[i],depth+1)
                except Exception: pass
        visit(app,[],0)
        return {'app':a['app'],'elements':rows,'warnings':warnings,'truncated':visited>=350 or len(rows)>=120}
    if op=='window':
        wid=window()
        geometry=dict(line.split('=',1) for line in command(['xdotool','getwindowgeometry','--shell',str(wid)]).splitlines() if '=' in line)
        return {'window':str(wid),'bounds':{'x':int(geometry['X']),'y':int(geometry['Y']),'width':int(geometry['WIDTH']),'height':int(geometry['HEIGHT'])}}
    if op in ('press','set_text'):
        e=resolve(a['locator'])
        if op=='set_text':
            editable=e.get_editable_text_iface()
            if not editable or not editable.set_text_contents(a.get('text','')): fail('The app rejected text replacement.')
        else:
            action=e.get_action_iface()
            if not action or not action.get_n_actions() or not action.do_action(0): fail('The app rejected activation.')
    elif op=='activate':
        component=None
        for i in range(app.get_child_count()):
            candidate=app.get_child_at_index(i).get_component_iface()
            if candidate and candidate.grab_focus(): component=candidate; break
        if not component: fail('The desktop did not focus this app. Activate it manually.')
    else:
        wid=window()
        command(['xdotool','windowactivate','--sync',str(wid)])
        if int(command(['xdotool','getactivewindow']))!=wid: fail('The allowed window is not active. No input was sent.')
        if op=='click':
            geometry=command(['xdotool','getwindowgeometry','--shell',str(wid)])
            g=dict(line.split('=',1) for line in geometry.splitlines() if '=' in line)
            x,y=a.get('x'),a.get('y')
            if not isinstance(x,(int,float)) or not isinstance(y,(int,float)) or not (int(g['X'])<=x<int(g['X'])+int(g['WIDTH']) and int(g['Y'])<=y<int(g['Y'])+int(g['HEIGHT'])): fail('Click must be inside the allowed window.')
            if int(command(['xdotool','getwindowpid',str(wid)]))!=pid: fail('Window ownership changed.')
            command(['xdotool','mousemove','--sync',str(int(x)),str(int(y))])
            pointer=dict(line.split('=',1) for line in command(['xdotool','getmouselocation','--shell']).splitlines() if '=' in line)
            if not same_window_tree(int(pointer['WINDOW']),wid): fail('Another app covers this point. No click was sent.')
            command(['xdotool','click','1'])
        elif op=='key':
            keys={'return':'Return','tab':'Tab','escape':'Escape','backspace':'BackSpace','left':'Left','right':'Right','up':'Up','down':'Down',**{k:k for k in 'acvszlwt'}}
            mods={'control':'ctrl','shift':'shift','option':'alt','alt':'alt','command':'super','super':'super'}
            if a.get('key','').lower() not in keys or any(m not in mods for m in a.get('modifiers',[]) or []): fail('Unsupported key or modifier.')
            command(['xdotool','key','--clearmodifiers','+'.join([mods[m] for m in a.get('modifiers',[]) or []]+[keys[a['key'].lower()]])])
        elif op=='scroll':
            amount=max(-20,min(20,int(a.get('amount') or 0)))
            command(['xdotool','mousemove','--window',str(wid),'30','30'])
            pointer=dict(line.split('=',1) for line in command(['xdotool','getmouselocation','--shell']).splitlines() if '=' in line)
            if not same_window_tree(int(pointer['WINDOW']),wid): fail('Another app covers this point. No scroll was sent.')
            if amount: command(['xdotool','click','--repeat',str(abs(amount)),'4' if amount>0 else '5'])
        else: fail('Use set_text on an inspected editable field for Linux text entry.')
    return {'status':'performed','app':a['app'],'operation':op,'next':'Inspect a fresh snapshot before another action.'}
try:
    request=json.loads(sys.stdin.read(100000))
    print(json.dumps(main(request),ensure_ascii=True))
except Exception as e:
    print(json.dumps({'error':str(e)}))
