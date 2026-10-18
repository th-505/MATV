import 'package:flutter/material.dart';

class TitleOverviewHeader extends StatelessWidget {
  const TitleOverviewHeader({super.key,required this.title,required this.poster,
    this.facts=const [],this.plot=''});
  final String title,poster,plot;
  final List<String> facts;

  @override
  Widget build(BuildContext context) => LayoutBuilder(builder:(context,bounds) {
    final wide=bounds.maxWidth>=720;
    final imageHeight=(MediaQuery.sizeOf(context).height*.34).clamp(140.0,320.0);
    final image=poster.isEmpty ? null : ClipRRect(
      borderRadius:BorderRadius.circular(16),
      child:SizedBox(key:const Key('detail-poster-frame'),
        width:wide?200:imageHeight*2/3,height:wide?300:imageHeight,
        child:Image.network(poster,fit:BoxFit.cover,
          errorBuilder:(_,_,_)=>const ColoredBox(color:Color(0xFF171817),
            child:Center(child:Icon(Icons.movie_outlined,size:48)))),
      ),
    );
    final info=Column(crossAxisAlignment:CrossAxisAlignment.start,mainAxisSize:MainAxisSize.min,children:[
      Text(title,style:Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight:FontWeight.bold)),
      if(facts.isNotEmpty) Padding(padding:const EdgeInsets.only(top:12),
        child:Wrap(spacing:12,runSpacing:8,children:facts.map((fact)=>Text(fact)).toList())),
      if(plot.isNotEmpty) Padding(padding:const EdgeInsets.only(top:16),child:Text(plot)),
    ]);
    if(wide) { return Row(crossAxisAlignment:CrossAxisAlignment.start,children:[
      if(image!=null)...[image,const SizedBox(width:28)],Expanded(child:info),
    ]); }
    return Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      if(image!=null)...[Center(child:image),const SizedBox(height:20)],info,
    ]);
  });
}
