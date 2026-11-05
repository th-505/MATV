import 'dart:io';
import 'dart:convert';
import 'package:analyzer/dart/analysis/utilities.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
class Metrics extends RecursiveAstVisitor<void>{
 final calls=<String>{};int branches=0,awaits=0,tries=0;
 @override void visitMethodInvocation(MethodInvocation n){final t=n.target?.toSource()??'';calls.add((RegExp(r'^[a-zA-Z_][\w?.]*$').hasMatch(t)?'$t.':'')+n.methodName.name);super.visitMethodInvocation(n);}
 @override void visitInstanceCreationExpression(InstanceCreationExpression n){calls.add('new '+n.constructorName.toSource());super.visitInstanceCreationExpression(n);}
 @override void visitAwaitExpression(AwaitExpression n){awaits++;super.visitAwaitExpression(n);}
 @override void visitIfStatement(IfStatement n){branches++;super.visitIfStatement(n);}
 @override void visitConditionalExpression(ConditionalExpression n){branches++;super.visitConditionalExpression(n);}
 @override void visitSwitchStatement(SwitchStatement n){branches++;super.visitSwitchStatement(n);}
 @override void visitTryStatement(TryStatement n){tries++;super.visitTryStatement(n);}
}
class Inventory extends RecursiveAstVisitor<void>{
 final String path;final dynamic lineInfo;final rows=<Map<String,dynamic>>[];
 Inventory(this.path,this.lineInfo);
 String owner(AstNode n){AstNode? p=n.parent;while(p!=null){if(p is ClassDeclaration)return p.name.lexeme;if(p is MixinDeclaration)return p.name.lexeme;if(p is EnumDeclaration)return p.name.lexeme;if(p is ExtensionDeclaration)return p.name?.lexeme??'extension';p=p.parent;}return '';}
 void add(AstNode n,String name,FormalParameterList? parameters,AstNode? body,String kind){final m=Metrics();body?.accept(m);rows.add({'file':path,'name':name,'owner':owner(n),'kind':kind,'line':lineInfo.getLocation(n.offset).lineNumber,'end_line':lineInfo.getLocation(n.end).lineNumber,'parameters':parameters?.parameters.map((p)=>p.name?.lexeme??'?').toList()??[],'calls':m.calls.toList()..sort(),'branches':m.branches,'awaits':m.awaits,'tries':m.tries});}
 @override void visitFunctionDeclaration(FunctionDeclaration n){add(n,n.name.lexeme,n.functionExpression.parameters,n.functionExpression.body,'function');super.visitFunctionDeclaration(n);}
 @override void visitMethodDeclaration(MethodDeclaration n){add(n,n.name.lexeme,n.parameters,n.body,n.isGetter?'getter':n.isSetter?'setter':'method');super.visitMethodDeclaration(n);}
 @override void visitConstructorDeclaration(ConstructorDeclaration n){add(n,n.name?.lexeme??'new',n.parameters,n.body,'constructor');super.visitConstructorDeclaration(n);}
}
void main(List<String> args){final root=Directory(args[0]);final output=<Map<String,dynamic>>[];for(final f in Directory('${root.path}/flutter_app/lib').listSync(recursive:true).whereType<File>().where((f)=>f.path.endsWith('.dart'))){if(f.path.endsWith('/supabase_config.dart'))continue;final parsed=parseString(content:f.readAsStringSync(),throwIfDiagnostics:false);final visitor=Inventory(f.path.substring(root.path.length+1),parsed.lineInfo);parsed.unit.accept(visitor);output.addAll(visitor.rows);}File(args[1]).writeAsStringSync(jsonEncode(output));stdout.writeln('Indexed ${output.length} Dart declarations.');}
