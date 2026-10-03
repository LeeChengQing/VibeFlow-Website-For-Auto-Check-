import {Program} from 'ogl';

/** OGL 1.0.11 queries shader logs synchronously in setShaders. With KHR parallel
 * compilation, defer those blocking queries until the GPU reports completion.
 * The shader source and linked program are identical to OGL's normal path. */
export class DeferredProgram extends Program {
  setShaders({vertex,fragment}){
    this.parallel=this.gl.getExtension('KHR_parallel_shader_compile');
    if(!this.parallel){super.setShaders({vertex,fragment});return;}
    if(vertex){this.gl.shaderSource(this.vertexShader,vertex);this.gl.compileShader(this.vertexShader);}
    if(fragment){this.gl.shaderSource(this.fragmentShader,fragment);this.gl.compileShader(this.fragmentShader);}
    this.gl.linkProgram(this.program);this.pending=true;
  }
  complete(){
    if(!this.pending)return true;
    const gl=this.gl;
    if(!gl.getProgramParameter(this.program,this.parallel.COMPLETION_STATUS_KHR))return false;
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error('Electric shader did not link');
    this.uniformLocations=new Map();
    const count=gl.getProgramParameter(this.program,gl.ACTIVE_UNIFORMS);
    for(let index=0;index<count;index++){
      const uniform=gl.getActiveUniform(this.program,index),split=uniform.name.match(/(\w+)/g);
      uniform.uniformName=split[0];uniform.nameComponents=split.slice(1);
      this.uniformLocations.set(uniform,gl.getUniformLocation(this.program,uniform.name));
    }
    this.attributeLocations=new Map();const locations=[];
    const attributes=gl.getProgramParameter(this.program,gl.ACTIVE_ATTRIBUTES);
    for(let index=0;index<attributes;index++){
      const attribute=gl.getActiveAttrib(this.program,index),location=gl.getAttribLocation(this.program,attribute.name);
      if(location===-1)continue;locations[location]=attribute.name;this.attributeLocations.set(attribute,location);
    }
    this.attributeOrder=locations.join('');this.pending=false;return true;
  }
}
