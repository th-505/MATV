import json
from pathlib import Path
rows=[]
def add(group,key,title,kind='movie',params=None,window=None):
 rows.append(dict(id=f'catalog:collection:{group}-{key}',group=group,title=title,type=kind,params=params or {},**({'window':window} if window else {})))
for group,kind,label in [('movie','movie','أفلام'),('series','tv','مسلسلات')]:
 for key,title,params,window in [
  ('top','أفضل عشرة '+label,{'sort_by':'vote_average.desc','vote_count.gte':'300' if kind=='movie' else '100'},None),
  ('popular','الأكثر رواجًا',{'sort_by':'popularity.desc'},None),
  ('year','الأعلى تقييمًا هذا العام',{'sort_by':'vote_average.desc','vote_count.gte':'50'},'year'),
  ('recent','أحدث '+label,{'sort_by':'primary_release_date.desc' if kind=='movie' else 'first_air_date.desc'},'past'),
  ('classic','كلاسيكيات تستحق المشاهدة',{'sort_by':'vote_average.desc','vote_count.gte':'300','primary_release_date.lte' if kind=='movie' else 'first_air_date.lte':'1999-12-31'},None),
  ('arabic','مكتبة عربية',{'with_original_language':'ar'},None)]:add(group,key,title,kind,params,window)
 movie=[(28,'أكشن'),(12,'مغامرات'),(16,'رسوم متحركة'),(35,'كوميديا'),(80,'جريمة'),(99,'وثائقي'),(18,'دراما'),(10751,'عائلي'),(14,'فانتازيا'),(36,'تاريخ'),(27,'رعب'),(10402,'موسيقى'),(9648,'غموض'),(10749,'رومانسي'),(878,'خيال علمي'),(53,'تشويق')]
 tv=[(10759,'أكشن ومغامرات'),(16,'رسوم متحركة'),(35,'كوميديا'),(80,'جريمة'),(99,'وثائقي'),(18,'دراما'),(10751,'عائلي'),(10762,'للأطفال'),(9648,'غموض'),(10765,'خيال علمي وفانتازيا'),(10768,'حروب وسياسة'),(10766,'دراما يومية'),(37,'ويسترن'),(10764,'واقع')]
 for genre,name in movie if kind=='movie' else tv:add(group,str(genre),name,kind,{'with_genres':str(genre)})
for key,title,kind,params,window in [
 ('top','أفضل عشرة أنمي','tv',{'sort_by':'vote_average.desc','vote_count.gte':'100'},None),('popular','أنمي رائج','tv',{},None),('movies','أفلام أنمي','movie',{},None),('week','حلقات أنمي هذا الأسبوع','tv',{},'week'),('upcoming','الأنمي الأسبوع القادم','tv',{},'upcoming'),('adventure','أنمي أكشن ومغامرات','tv',{'with_genres':'16,10759'},None)]:add('anime',key,title,kind,{'with_original_language':'ja','with_genres':'16',**params},window)
for key,title,params,window in [('top','أفضل عشرة مسلسلات تركية',{'sort_by':'vote_average.desc','vote_count.gte':'50'},None),('popular','التركي الرائج',{},None),('week','حلقات تركية هذا الأسبوع',{},'week'),('upcoming','التركي الأسبوع القادم',{},'upcoming'),('drama','دراما تركية',{'with_genres':'18'},None),('comedy','كوميديا تركية',{'with_genres':'35'},None)]:add('turkish',key,title,'tv',{'with_original_language':'tr',**params},window)
Path('shared/catalog-collections.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
# Source-controlled generated client definitions contain no service credentials.
Path('flutter_app/lib/src/catalog_collection_defs.dart').write_text('// Generated from shared/catalog-collections.json.\nconst najdCatalogCollections = <Map<String, String>>[\n'+''.join("  {'id': "+json.dumps(r['id'])+", 'group': "+json.dumps(r['group'])+", 'title': "+json.dumps(r['title'],ensure_ascii=False)+"},\n" for r in rows)+'];\n')
print(len(rows),'observed-data collection policies')
