import Ajv from "ajv"

export function validateJson(subject: string, json: string, schemaObj: object): any
{
  const jsonObj = JSON.parse(json);
  const validate = new Ajv().compile(schemaObj);
  if ( !validate(jsonObj) )
    throw new Error(`Validation of ${subject} failed: ${JSON.stringify(validate.errors)}`);
  return jsonObj;
}