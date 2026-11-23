export type IcmpMessage =
  | {
      readonly type: "echo-request";
      readonly identifier: number;
      readonly sequence: number;
    }
  | {
      readonly type: "echo-reply";
      readonly identifier: number;
      readonly sequence: number;
    }
  | {
      readonly type: "time-exceeded";
      readonly sequence: number;
      readonly expiredTtl: number;
    }
  | {
      readonly type: "destination-unreachable";
      readonly sequence: number;
      readonly reason: string;
    };
