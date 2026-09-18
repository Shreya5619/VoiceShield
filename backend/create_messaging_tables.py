import boto3

REGION = "us-east-1"


def create(table_name, partition_key, sort_key=None):
    definitions = [{"AttributeName": partition_key, "AttributeType": "S"}]
    schema = [{"AttributeName": partition_key, "KeyType": "HASH"}]
    if sort_key:
        definitions.append({"AttributeName": sort_key, "AttributeType": "S"})
        schema.append({"AttributeName": sort_key, "KeyType": "RANGE"})
    try:
        boto3.client("dynamodb", region_name=REGION).create_table(
            TableName=table_name,
            AttributeDefinitions=definitions,
            KeySchema=schema,
            BillingMode="PAY_PER_REQUEST",
        )
        print(f"created {table_name}")
    except boto3.client("dynamodb", region_name=REGION).exceptions.ResourceInUseException:
        print(f"exists {table_name}")


create("VoiceShieldVoiceShares", "id")
create("VoiceShieldInbox", "recipient_phone", "id")
create("VoiceShieldPushSubscriptions", "recipient_phone", "id")