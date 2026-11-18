(function(root){
  "use strict";
  const aliases={projectName:"name",projectType:"type",isOngoing:"ongoing",actualResponsibilities:"responsibilities",actualWork:"completedWork",toolsUsed:"tools",resumeAllowed:"allowInResume"};
  function projectView(item){
    const result=JSON.parse(JSON.stringify(item||{}));
    Object.entries(aliases).forEach(([key,old])=>{
      if(!Object.prototype.hasOwnProperty.call(result,key))result[key]=result[old]===undefined?null:result[old];
    });
    if(result.isOngoing==="是")result.isOngoing=true;
    else if(result.isOngoing==="否")result.isOngoing=false;
    else if(typeof result.isOngoing!=="boolean")result.isOngoing=null;
    if(typeof result.resumeAllowed!=="boolean")result.resumeAllowed=null;
    ["actualOutputs","links"].forEach(key=>{if(result[key]===undefined)result[key]=null;});
    return result;
  }
  root.jobProjectFacts={projectView};
  if(typeof module!=="undefined")module.exports=root.jobProjectFacts;
})(typeof window==="undefined"?globalThis:window);
