export async function onRequestPost({request,env}) {
  if (!env.OPENAI_API_KEY) return Response.json({error:'Configure OPENAI_API_KEY nas variáveis secretas do Cloudflare Pages.'},{status:503});
  try {
    const form=await request.formData();
    const file=form.get('image');
    if (!(file instanceof File)||!file.type.startsWith('image/')) return Response.json({error:'Envie uma imagem válida.'},{status:400});
    if(file.size>8*1024*1024)return Response.json({error:'Imagem maior que 8 MB.'},{status:413});
    const bytes=new Uint8Array(await file.arrayBuffer());
    let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const base64=btoa(binary);
    const subject=String(form.get('subject')||'Geral').slice(0,80);
    const grade=String(form.get('grade')||'Fundamental').slice(0,80);
    const schema={type:'object',additionalProperties:false,required:['extracted_text','topic','questions'],properties:{extracted_text:{type:'string'},topic:{type:'string'},questions:{type:'array',minItems:3,maxItems:3,items:{type:'object',additionalProperties:false,required:['question','options','correct_index','explanation'],properties:{question:{type:'string'},options:{type:'array',minItems:4,maxItems:4,items:{type:'string'}},correct_index:{type:'integer',minimum:0,maximum:3},explanation:{type:'string'}}}}}};
    const upstream=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Authorization':'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:env.OPENAI_MODEL||'gpt-4o-mini',temperature:0.2,response_format:{type:'json_schema',json_schema:{name:'homework_quiz',strict:true,schema}},messages:[{role:'system',content:'Você é um educador brasileiro. Analise a imagem de uma atividade escolar. Transcreva o texto visível fielmente (não invente trechos), identifique o assunto e crie exatamente três perguntas objetivas com quatro alternativas cada, baseadas SOMENTE no conteúdo visível. Linguagem adequada à série. Uma única alternativa correta por questão, com explicação curta. Se a imagem estiver ilegível, não for dever escolar ou houver conteúdo insuficiente para criar três perguntas pertinentes, responda exatamente com o JSON válido do esquema, extracted_text descrevendo o problema, topic "IMAGEM_ILEGIVEL", e três questões vazias; o servidor recusará. Não reproduza nomes, endereços ou outros dados pessoais na transcrição.'},{role:'user',content:[{type:'text',text:`Disciplina: ${subject}. Série: ${grade}. Leia esta foto e gere três perguntas relacionadas ao dever.`},{type:'image_url',image_url:{url:`data:${file.type};base64,${base64}`,detail:'high'}}]}]})});
    const raw=await upstream.json();
    if(!upstream.ok)return Response.json({error:'Serviço de IA indisponível. Verifique a chave, saldo e modelo configurados.'},{status:502});
    const content=raw.choices?.[0]?.message?.content;
    if(!content)throw Error('Resposta vazia');
    const result=JSON.parse(content);
    if(result.topic==='IMAGEM_ILEGIVEL'||result.questions?.some(q=>!q.question||q.options?.some(o=>!o)))return Response.json({error:'Não consegui ler conteúdo suficiente. Tire outra foto com mais luz, foco e o texto completo.'},{status:422});
    return Response.json(result,{headers:{'Cache-Control':'no-store'}});
  }catch(e){return Response.json({error:'Não foi possível processar a imagem. Confira o formato e tente novamente.'},{status:500})}
}
