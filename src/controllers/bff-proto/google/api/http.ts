/* eslint-disable */
import _m0 from "protobufjs/minimal";

export const protobufPackage = "google.api";

export interface Http {
  rules: HttpRule[];
}

export interface HttpRule {
  get: string | undefined;
  put: string | undefined;
  post: string | undefined;
  delete: string | undefined;
  patch: string | undefined;
  custom: CustomHttpPattern | undefined;
  selector: string;
  body: string;
  additionalBindings: HttpRule[];
}

export interface CustomHttpPattern {
  kind: string;
  path: string;
}

function createBaseHttp(): Http {
  return { rules: [] };
}

export const Http = {
  encode(message: Http, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    for (const v of message.rules) {
      HttpRule.encode(v!, writer.uint32(10).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): Http {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseHttp();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.rules.push(HttpRule.decode(reader, reader.uint32()));
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): Http {
    return { rules: Array.isArray(object?.rules) ? object.rules.map((e: any) => HttpRule.fromJSON(e)) : [] };
  },

  toJSON(message: Http): unknown {
    const obj: any = {};
    if (message.rules) {
      obj.rules = message.rules.map((e) => e ? HttpRule.toJSON(e) : undefined);
    } else {
      obj.rules = [];
    }
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<Http>, I>>(object: I): Http {
    const message = createBaseHttp();
    message.rules = object.rules?.map((e) => HttpRule.fromPartial(e)) || [];
    return message;
  },
};

function createBaseHttpRule(): HttpRule {
  return {
    get: undefined,
    put: undefined,
    post: undefined,
    delete: undefined,
    patch: undefined,
    custom: undefined,
    selector: "",
    body: "",
    additionalBindings: [],
  };
}

export const HttpRule = {
  encode(message: HttpRule, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.get !== undefined) {
      writer.uint32(18).string(message.get);
    }
    if (message.put !== undefined) {
      writer.uint32(26).string(message.put);
    }
    if (message.post !== undefined) {
      writer.uint32(34).string(message.post);
    }
    if (message.delete !== undefined) {
      writer.uint32(42).string(message.delete);
    }
    if (message.patch !== undefined) {
      writer.uint32(50).string(message.patch);
    }
    if (message.custom !== undefined) {
      CustomHttpPattern.encode(message.custom, writer.uint32(66).fork()).ldelim();
    }
    if (message.selector !== "") {
      writer.uint32(10).string(message.selector);
    }
    if (message.body !== "") {
      writer.uint32(58).string(message.body);
    }
    for (const v of message.additionalBindings) {
      HttpRule.encode(v!, writer.uint32(90).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): HttpRule {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseHttpRule();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 2:
          message.get = reader.string();
          break;
        case 3:
          message.put = reader.string();
          break;
        case 4:
          message.post = reader.string();
          break;
        case 5:
          message.delete = reader.string();
          break;
        case 6:
          message.patch = reader.string();
          break;
        case 8:
          message.custom = CustomHttpPattern.decode(reader, reader.uint32());
          break;
        case 1:
          message.selector = reader.string();
          break;
        case 7:
          message.body = reader.string();
          break;
        case 11:
          message.additionalBindings.push(HttpRule.decode(reader, reader.uint32()));
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): HttpRule {
    return {
      get: isSet(object.get) ? String(object.get) : undefined,
      put: isSet(object.put) ? String(object.put) : undefined,
      post: isSet(object.post) ? String(object.post) : undefined,
      delete: isSet(object.delete) ? String(object.delete) : undefined,
      patch: isSet(object.patch) ? String(object.patch) : undefined,
      custom: isSet(object.custom) ? CustomHttpPattern.fromJSON(object.custom) : undefined,
      selector: isSet(object.selector) ? String(object.selector) : "",
      body: isSet(object.body) ? String(object.body) : "",
      additionalBindings: Array.isArray(object?.additionalBindings)
        ? object.additionalBindings.map((e: any) => HttpRule.fromJSON(e))
        : [],
    };
  },

  toJSON(message: HttpRule): unknown {
    const obj: any = {};
    message.get !== undefined && (obj.get = message.get);
    message.put !== undefined && (obj.put = message.put);
    message.post !== undefined && (obj.post = message.post);
    message.delete !== undefined && (obj.delete = message.delete);
    message.patch !== undefined && (obj.patch = message.patch);
    message.custom !== undefined &&
      (obj.custom = message.custom ? CustomHttpPattern.toJSON(message.custom) : undefined);
    message.selector !== undefined && (obj.selector = message.selector);
    message.body !== undefined && (obj.body = message.body);
    if (message.additionalBindings) {
      obj.additionalBindings = message.additionalBindings.map((e) => e ? HttpRule.toJSON(e) : undefined);
    } else {
      obj.additionalBindings = [];
    }
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<HttpRule>, I>>(object: I): HttpRule {
    const message = createBaseHttpRule();
    message.get = object.get ?? undefined;
    message.put = object.put ?? undefined;
    message.post = object.post ?? undefined;
    message.delete = object.delete ?? undefined;
    message.patch = object.patch ?? undefined;
    message.custom = (object.custom !== undefined && object.custom !== null)
      ? CustomHttpPattern.fromPartial(object.custom)
      : undefined;
    message.selector = object.selector ?? "";
    message.body = object.body ?? "";
    message.additionalBindings = object.additionalBindings?.map((e) => HttpRule.fromPartial(e)) || [];
    return message;
  },
};

function createBaseCustomHttpPattern(): CustomHttpPattern {
  return { kind: "", path: "" };
}

export const CustomHttpPattern = {
  encode(message: CustomHttpPattern, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.kind !== "") {
      writer.uint32(10).string(message.kind);
    }
    if (message.path !== "") {
      writer.uint32(18).string(message.path);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): CustomHttpPattern {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseCustomHttpPattern();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.kind = reader.string();
          break;
        case 2:
          message.path = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): CustomHttpPattern {
    return { kind: isSet(object.kind) ? String(object.kind) : "", path: isSet(object.path) ? String(object.path) : "" };
  },

  toJSON(message: CustomHttpPattern): unknown {
    const obj: any = {};
    message.kind !== undefined && (obj.kind = message.kind);
    message.path !== undefined && (obj.path = message.path);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<CustomHttpPattern>, I>>(object: I): CustomHttpPattern {
    const message = createBaseCustomHttpPattern();
    message.kind = object.kind ?? "";
    message.path = object.path ?? "";
    return message;
  },
};

type Builtin = Date | Function | Uint8Array | string | number | boolean | undefined;

export type DeepPartial<T> = T extends Builtin ? T
  : T extends Array<infer U> ? Array<DeepPartial<U>> : T extends ReadonlyArray<infer U> ? ReadonlyArray<DeepPartial<U>>
  : T extends {} ? { [K in keyof T]?: DeepPartial<T[K]> }
  : Partial<T>;

type KeysOfUnion<T> = T extends T ? keyof T : never;
export type Exact<P, I extends P> = P extends Builtin ? P
  : P & { [K in keyof P]: Exact<P[K], I[K]> } & { [K in Exclude<keyof I, KeysOfUnion<P>>]: never };

function isSet(value: any): boolean {
  return value !== null && value !== undefined;
}
